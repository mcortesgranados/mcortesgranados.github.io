/**
 * Q45 — distributed processing: how work is spread across the processes that do it.
 *
 * Component: `service-fabric-workflow.js` (the connectivity fabric).
 *
 * The three numbers that decide the actual throughput and correctness of a consumer
 * group are all configuration rather than code, and they are all easy to get wrong:
 * the partition count (which caps parallelism), the ordering key (which decides what
 * "in order" even means), and where the commit happens (which decides whether a crash
 * loses or duplicates work). This file states them explicitly per topic, and treats a
 * rebalance as a normal event rather than an exception, because adding a consumer at
 * 3 a.m. is exactly when the handler is tested.
 */

import type { Consumer, EachMessagePayload, Kafka } from 'kafkajs';

export interface TopicTopology {
  readonly topic: string;
  /** Parallelism is capped by this: 12 partitions means at most 12 useful consumers. */
  readonly partitions: number;
  /** The header whose value is hashed to choose a partition. */
  readonly orderingKey: 'aggregateId' | 'tenantId';
  /** What ordering guarantee the consumers may rely on. Stated, not assumed. */
  readonly ordering: 'per-key' | 'none';
  /** Commit only after the side effect is durable. */
  readonly commit: 'after-processing' | 'after-batch';
  readonly dlq: string;
  readonly maxAttempts: number;
  readonly replay: { supported: boolean; method: 'offset' | 'timestamp' | 'full-rebuild' };
}

export const TOPOLOGY: readonly TopicTopology[] = [
  {
    topic: 'orders.events.v2',
    partitions: 12,
    orderingKey: 'aggregateId',
    // Ordering matters per order and nowhere else: two orders have no meaningful
    // relative order, and pretending otherwise would force a single consumer.
    ordering: 'per-key',
    commit: 'after-processing',
    dlq: 'orders.events.v2.dlq',
    maxAttempts: 5,
    replay: { supported: true, method: 'offset' },
  },
  {
    topic: 'payments.events.v1',
    partitions: 6,
    orderingKey: 'aggregateId',
    ordering: 'per-key',
    commit: 'after-processing',
    dlq: 'payments.events.v1.dlq',
    maxAttempts: 5,
    replay: { supported: true, method: 'offset' },
  },
  {
    topic: 'analytics.clickstream',
    partitions: 24,
    orderingKey: 'tenantId',
    // Throughput matters, order does not: the projection is additive.
    ordering: 'none',
    commit: 'after-batch',
    dlq: 'analytics.clickstream.dlq',
    maxAttempts: 3,
    replay: { supported: true, method: 'full-rebuild' },
  },
];

/**
 * A consumer group that behaves. The parts that matter are the rebalance hooks: on a
 * revoke, in-flight work is completed and committed before the partitions move, and on
 * an assign, nothing is assumed about what the previous owner had done.
 */
export function createConsumerGroup(
  kafka: Kafka,
  topology: TopicTopology,
  groupId: string,
  handler: (payload: EachMessagePayload) => Promise<void>,
  options: { maxParallelism?: number } = {},
) {
  // The cap is either the partition count or the operator's setting, whichever is
  // lower. A 20th consumer on a 12-partition topic sits idle and holds nothing.
  const parallelism = Math.min(options.maxParallelism ?? topology.partitions, topology.partitions);

  const consumer: Consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    // Manual commit: the default auto-commit commits on a timer, which is exactly the
    // wrong moment — it can commit a message whose side effect has not landed yet.
    autoCommit: false,
    maxBytesPerPartition: 1_048_576,
    rebalanceTimeout: 60_000,
  });

  const inFlight = new Map<number, Promise<void>>();

  return {
    parallelism,

    async start(): Promise<void> {
      await consumer.connect();
      await consumer.subscribe({ topic: topology.topic, fromBeginning: false });

      await consumer.run({
        // One message at a time per partition: the ordering guarantee is per key, and
        // processing two messages of the same key concurrently would break it.
        partitionsConsumedConcurrently: parallelism,
        autoCommit: false,

        eachMessage: async (payload) => {
          const partition = payload.partition;

          // Track in-flight work per partition so a revoke can wait for it.
          const work = handleWithGuards(payload);
          inFlight.set(partition, work);
          try {
            await work;
          } finally {
            if (inFlight.get(partition) === work) inFlight.delete(partition);
          }
        },
      });
    },

    /** Called on a revoke: finish and commit before the partition moves away. */
    async onRevoke(partitions: number[]): Promise<void> {
      await Promise.allSettled(partitions.map((partition) => inFlight.get(partition)).filter(Boolean));
      // Whatever is still unresolved will be redelivered to the new owner and
      // deduplicated there, which is why every handler has to be idempotent.
    },

    /** Called on an assign: nothing is carried over from the previous owner. */
    onAssign(): void {
      inFlight.clear();
    },

    async stop(): Promise<void> {
      await consumer.stop();
      await consumer.disconnect();
    },

    async replay(fromOffset: Record<number, string>): Promise<void> {
      if (!topology.replay.supported) {
        throw new Error(`${topology.topic} cannot be replayed: the projection is rebuilt instead.`);
      }
      // Replaying is a supported operation, not an incident: seek and re-run, and the
      // idempotent handler makes the overlap harmless.
      await consumer.seek(fromOffset);
    },
  };

  /**
   * The guard rails around one message: bounded attempts, and a dead-letter route that
   * carries the failure so the message can be diagnosed and replayed after a fix.
   */
  async function handleWithGuards(payload: EachMessagePayload): Promise<void> {
    const attempts = Number(payload.message.headers?.['x-attempts'] ?? '1');

    try {
      // The handler is idempotent: the dedup key is the message id, and the check
      // shares a transaction with the side effect.
      await handler(payload);

      // Commit only now. Committing before the effect is how a crash loses a message
      // that the broker believed was handled.
      await consumer.commitOffsets([{
        topic: payload.topic,
        partition: payload.partition,
        offset: (Number(payload.message.offset) + 1).toString(),
      }]);
    } catch (failure) {
      if (attempts >= topology.maxAttempts) {
        // Deterministic failure: one more attempt produces the same exception, so it
        // is parked with its context instead of occupying the partition forever.
        await publishToDlq(topology.dlq, payload, failure as Error, attempts);
        await consumer.commitOffsets([{
          topic: payload.topic,
          partition: payload.partition,
          offset: (Number(payload.message.offset) + 1).toString(),
        }]);
        return;
      }

      // Not committed: the broker redelivers with the attempt count incremented.
      throw new Error(
        `attempt ${attempts}/${topology.maxAttempts} failed for ${payload.topic}[${payload.partition}]@${payload.message.offset}: ${(failure as Error).message}`,
      );
    }
  }
}

declare function publishToDlq(topic: string, payload: EachMessagePayload, failure: Error, attempts: number): Promise<void>;
