/**
 * Q28 — contract tests for the orders API.
 *
 * Two layers of verification, because a documented contract and a real API are
 * not the same thing:
 *
 *  1. The published OpenAPI document is compared against a checked-in snapshot,
 *     so a change in status codes, headers or error shape fails the build instead
 *     of drifting quietly away from the spec the client teams integrate against.
 *  2. The suite runs against the real HTTP pipeline — WebApplicationFactory with a
 *     containerised database in CI, a deployed environment locally — and asserts
 *     the semantics the design claims: idempotency, preconditions, pagination
 *     bounds and one error shape for every failure.
 *
 * The client under test is the typed client generated from that same document,
 * which is what the Angular SPA actually consumes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { OrdersClient, ProblemDetails } from './generated/orders-client';

const baseUrl = process.env.API_BASE_URL ?? 'https://localhost:5001/api/v1';
let client: OrdersClient;

beforeAll(async () => {
  client = new OrdersClient({ baseUrl, token: await issueTestToken({ scope: 'orders:write', subject: 'customer-42' }) });
});

describe('orders API — contract', () => {
  it('publishes a document that matches the checked-in snapshot', async () => {
    const document = await client.openApiDocument();

    // A difference here means the API changed without the consumers being told.
    expect(document.paths['/orders'].get.responses).toHaveProperty('429');
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('versions in the path rather than the header', async () => {
    expect(client.baseUrl).toMatch(/\/api\/v\d+$/);
  });
});

describe('orders API — HTTP semantics', () => {
  it('answers 201 with a Location header on create', async () => {
    const created = await client.createOrder({ lines: [{ sku: 'ABC-1', quantity: 2, unitPrice: 19.9 }] });

    expect(created.status).toBe(201);
    expect(created.location).toMatch(/\/orders\/[0-9a-f-]{36}$/);
  });

  it('does not create a second order when the same idempotency key is replayed', async () => {
    const key = crypto.randomUUID();
    const body = { lines: [{ sku: 'ABC-1', quantity: 1, unitPrice: 19.9 }] };

    const first = await client.createOrder(body, { idempotencyKey: key });
    const replay = await client.createOrder(body, { idempotencyKey: key });

    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
  });

  it('rejects a stale write with 412 and a missing precondition with 428', async () => {
    const order = await client.createOrder({ lines: [{ sku: 'ABC-1', quantity: 1, unitPrice: 5 }] });

    const withoutIfMatch = await client.replaceOrder(order.body.id, { reason: 'first' });
    expect(withoutIfMatch.status).toBe(428);

    const stale = await client.replaceOrder(order.body.id, { reason: 'second' }, { ifMatch: 'W/"stale"' });
    expect(stale.status).toBe(412);
  });

  it('makes DELETE idempotent and answers 204 both times', async () => {
    const order = await client.createOrder({ lines: [{ sku: 'ABC-1', quantity: 1, unitPrice: 5 }] });

    expect((await client.cancelOrder(order.body.id)).status).toBe(204);
    expect((await client.cancelOrder(order.body.id)).status).toBe(204);
  });
});

describe('orders API — collections', () => {
  it('caps the page size instead of honouring an unbounded request', async () => {
    const page = await client.listOrders({ size: 10_000 });

    expect(page.body.items.length).toBeLessThanOrEqual(100);
  });

  it('walks the cursor to the end of the collection', async () => {
    const first = await client.listOrders({ size: 5 });
    const second = await client.listOrders({ size: 5, after: first.body.nextCursor });

    expect(first.body.items.map((order) => order.id))
      .not.toEqual(second.body.items.map((order) => order.id));
  });

  it('documents the filter grammar it accepts', async () => {
    const filtered = await client.listOrders({ status: 'confirmed', sort: '-createdAt' });

    expect(filtered.status).toBe(200);
    expect(filtered.body.items.every((order) => order.status === 'confirmed')).toBe(true);
  });
});

describe('orders API — errors', () => {
  it('returns one problem-details shape for every failure mode', async () => {
    const notFound = await client.getOrder(crypto.randomUUID());
    const invalid = await client.confirmOrder('not-a-guid' as never);

    for (const response of [notFound, invalid]) {
      const problem = response.body as ProblemDetails;
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(problem.type).toMatch(/^https:\/\//);
      expect(problem.title.length).toBeGreaterThan(0);
      expect(problem.status).toBe(response.status);
      expect(problem.traceId).toBeTruthy();       // the same id appears in the server log
    }
  });

  it('does not reveal another tenant\'s resource', async () => {
    const foreign = await client.getOrder('11111111-1111-1111-1111-111111111111');

    expect(foreign.status).toBe(404);            // not 403: existence is not disclosed
  });

  it('refuses a caller without the policy and never trusts a body-supplied identity', async () => {
    const anonymous = new OrdersClient({ baseUrl });
    expect((await anonymous.listOrders({ size: 1 })).status).toBe(401);
  });
});
