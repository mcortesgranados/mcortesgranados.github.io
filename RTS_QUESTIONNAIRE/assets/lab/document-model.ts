import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Collection, MongoClient } from 'mongodb';

/**
 * One table, several entity types. The key schema is derived from the access
 * patterns rather than from the object model, and the same aggregate is
 * expressed for MongoDB where the document is read as a whole.
 */
export const keys = {
  customer: (id: string) => ({ PK: `CUSTOMER#${id}`, SK: 'PROFILE' }),
  order: (customerId: string, orderId: string) => ({ PK: `CUSTOMER#${customerId}`, SK: `ORDER#${orderId}` }),
  orderByStatus: (status: string, createdAt: string) => ({ GSI1PK: `STATUS#${status}`, GSI1SK: createdAt }),
};

export class OrderStore {
  private readonly client: DynamoDBDocumentClient;

  constructor(client: DynamoDBClient, private readonly tableName: string) {
    this.client = DynamoDBDocumentClient.from(client);
  }

  /** One Query per screen: no Scan on any read path. */
  async listOrders(customerId: string, limit = 20) {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `CUSTOMER#${customerId}`, ':sk': 'ORDER#' },
        Limit: limit,
        ScanIndexForward: false, // newest first
      }),
    );

    return Items ?? [];
  }

  /** Conditional write = idempotency without a distributed lock. */
  async confirmOrder(customerId: string, orderId: string, expectedVersion: number) {
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: this.tableName,
              Key: keys.order(customerId, orderId),
              ConditionExpression: 'version = :expected',
              UpdateExpression: 'SET #status = :confirmed, version = :next',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':expected': expectedVersion,
                ':next': expectedVersion + 1,
                ':confirmed': 'CONFIRMED',
              },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: { ...keys.order(customerId, orderId), SK: 'OUTBOX#OrderConfirmed', payload: { orderId } },
            },
          },
        ],
      }),
    );
  }
}

/** MongoDB: the aggregate is one document, so a screen is one round trip. */
export async function loadOrderAggregate(uri: string, orderId: string) {
  const client = new MongoClient(uri);

  try {
    const orders: Collection = client.db('sales').collection('orders');
    return await orders.findOne(
      { _id: orderId },
      { projection: { customerId: 1, status: 1, total: 1, lines: { $slice: 50 } } },
    );
  } finally {
    await client.close();
  }
}
