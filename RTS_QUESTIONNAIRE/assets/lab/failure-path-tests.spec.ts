/**
 * Q46 — the failure paths, as tests.
 *
 * Component: `pattern-inventory-workflow.js` (the pattern inventory).
 *
 * A distributed-system pattern is only as good as its behaviour when something goes
 * wrong, and the difference between a pattern that works and one that has been read
 * about is whether these cases are exercised. Every scenario in this file is one that
 * has a plausible story behind it: a redelivery at 3 a.m., a reordered message, a
 * compensation that could not complete, a dependency that went quiet, a process killed
 * mid-message, a relay that crashed between publishing and marking.
 *
 * None of these are unit tests of the happy path. They run against the real pipeline
 * with a containerised broker and database, because every one of them is a property of
 * the infrastructure as much as of the code.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createHarness, type Harness } from './harness/distributed';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness({ broker: 'kafka', database: 'postgres', topic: 'orders.events.v2' });
});

afterEach(async () => {
  await harness.reset();
});

describe('at-least-once delivery', () => {
  it('applies the effect once when the same message is delivered twice', async () => {
    const event = harness.event.orderConfirmed({ orderId: 'o-1', version: 3 });

    await harness.deliver(event);
    await harness.deliver(event);          // the redelivery the transport will do eventually

    // The dedup row and the effect are in one transaction, so the second delivery finds
    // the key and returns without touching the projection.
    expect(await harness.projection.countOrders()).toBe(1);
    expect(await harness.projection.chargeCount('o-1')).toBe(1);
  });

  it('is a no-op when the consumer dies after the effect but before the commit', async () => {
    const event = harness.event.orderConfirmed({ orderId: 'o-2', version: 1 });

    // The crash is simulated exactly where it hurts: the side effect is durable, the
    // offset was not committed.
    await harness.deliverThenKillBeforeCommit(event);

    expect(await harness.projection.countOrders()).toBe(1);

    // The broker redelivers; the dedup key makes it a no-op rather than a second order.
    await harness.deliver(event);
    expect(await harness.projection.countOrders()).toBe(1);
  });

  it('replays a message that failed deterministically into the dead-letter queue', async () => {
    harness.failNextDeliveryWith(new Error('sku is not a valid UUID'));

    await harness.deliverUntilExhausted(harness.event.orderConfirmed({ orderId: 'o-3', version: 1 }));

    expect(await harness.dlq.depth()).toBe(1);
    expect(await harness.dlq.lastError()).toContain('not a valid UUID');

    // The partition is not blocked: the next message is processed normally while the
    // poison one waits for a human.
    await harness.deliver(harness.event.orderConfirmed({ orderId: 'o-4', version: 1 }));
    expect(await harness.projection.countOrders()).toBe(1);
  });
});

describe('ordering', () => {
  it('skips a stale message instead of applying it backwards', async () => {
    await harness.deliver(harness.event.orderConfirmed({ orderId: 'o-5', version: 5 }));

    // A redelivery of an older version, which a rebalance makes possible.
    await harness.deliver(harness.event.orderCancelled({ orderId: 'o-5', version: 3 }));

    expect(await harness.projection.statusOf('o-5')).toBe('confirmed');
  });

  it('preserves order per aggregate while allowing parallelism across aggregates', async () => {
    await Promise.all([
      harness.deliverInOrder('o-6', [1, 2, 3]),
      harness.deliverInOrder('o-7', [1, 2, 3]),
    ]);

    expect(await harness.projection.lastVersionOf('o-6')).toBe(3);
    expect(await harness.projection.lastVersionOf('o-7')).toBe(3);
  });
});

describe('saga compensation', () => {
  it('compensates in reverse order when a later step fails', async () => {
    harness.participants.shipping.failNextBooking();

    const outcome = await harness.saga.run('order-fulfilment', { orderId: 'o-8' });

    expect(outcome).toBe('compensated');
    expect(harness.participants.payments.refundedFor('o-8')).toBe(1);
    expect(harness.participants.inventory.releasedFor('o-8')).toBe(1);
  });

  it('queues for reconciliation when a compensation itself fails', async () => {
    harness.participants.shipping.failNextBooking();
    harness.participants.payments.failNextRefund();

    await harness.saga.run('order-fulfilment', { orderId: 'o-9' });

    // This is the assertion that matters most in the file: a compensation that cannot
    // complete is a money problem, so it must be visible rather than swallowed.
    expect(await harness.reconciliation.pending()).toContain('o-9');
    expect(await harness.alerts.raised()).toContainEqual(
      expect.objectContaining({ name: 'compensation-failed', orderId: 'o-9' }),
    );
  });

  it('resumes a saga from its persisted state after a restart', async () => {
    const first = await harness.saga.runUntilStep('order-fulfilment', { orderId: 'o-10' }, 'charge-payment');
    expect(first).toBe('waiting');

    // The process dies and comes back; the invariants are the same as before because the
    // state was persisted after every step.
    await harness.restart();

    const resumed = await harness.saga.resume('order-fulfilment', 'o-10');

    expect(resumed).toBe('completed');
    // The step that had already succeeded is not repeated, which is what the persisted
    // state and the idempotency key together guarantee.
    expect(harness.participants.payments.chargeCount('o-10')).toBe(1);
  });
});

describe('resilience policies', () => {
  it('opens the circuit and degrades the feature instead of failing the request', async () => {
    harness.dependencies.payments.failWith(503, { times: 50 });

    const responses = await harness.callInSequence(50, () => harness.api.confirmOrder('o-11'));

    // The breaker opens, and the fallback answers the request: the caller gets a
    // degraded response, not a 500 that would have reached the user anyway.
    expect(harness.dependencies.payments.breakerState()).toBe('open');
    expect(responses.at(-1)!.status).toBe(200);
    expect(responses.at(-1)!.body).toMatchObject({ state: 'pending-confirmation' });
    expect(await harness.alerts.raised()).toContainEqual(
      expect.objectContaining({ name: 'circuit-open', dependency: 'payments' }),
    );
  });

  it('bounds the retry budget instead of amplifying the outage', async () => {
    harness.dependencies.payments.failWith(503, { times: 50 });

    await harness.api.confirmOrder('o-12');

    // Two retries per request plus the original attempt, and not one more: an unbounded
    // retry turns a dependency outage into a self-inflicted one.
    expect(harness.dependencies.payments.attempts()).toBeLessThanOrEqual(3);
  });

  it('does not retry a non-idempotent call at the edge', async () => {
    harness.dependencies.orders.failWith(503, { times: 50 });

    await harness.gateway.post('/api/v2/orders', { body: { lines: [{ sku: 'ABC-1', quantity: 1 }] } });

    expect(harness.dependencies.orders.attempts()).toBe(1);
  });
});
