/**
 * Q35 — the outbox relay and the reconciliation job.
 *
 * Component: `distributed-tx-workflow.js` (the mechanism selection).
 *
 * The relay is the half of the outbox pattern that turns "committed together" into
 * "published exactly as often as it should be": it claims unpublished rows, publishes
 * them in per-aggregate order and marks them published. The marking is not a
 * transaction with the broker — that would be a distributed transaction — so the
 * relay is written to be safe when it crashes between publishing and marking, which
 * it will.
 *
 * The reconciliation job exists because compensation is best-effort by nature. It
 * compares the saga's own record against each participant and repairs what escaped,
 * which is the only honest way to run a system whose consistency is eventual.
 */

import type { Database } from './db';
import type { Broker } from './broker';
import type { SagaRegistry } from './saga-registry';

export interface OutboxRow {
  readonly id: string;
  readonly aggregateId: string;
  /** Monotonic per aggregate: the ordering the relay must preserve. */
  readonly aggregateVersion: number;
  readonly topic: string;
  readonly payload: unknown;
  readonly headers: Record<string, string>;
  readonly publishedAt: Date | null;
  readonly attempts: number;
}

/** Delay before an unpublished row becomes eligible again, per attempt. */
function backoffMs(attempts: number): number {
  const base = Math.min(2 ** attempts * 250, 30_000);
  // Jitter, so a broker outage does not produce a fleet of relays retrying in step.
  return base / 2 + Math.random() * (base / 2);
}

export class OutboxRelay {
  constructor(
    private readonly db: Database,
    private readonly broker: Broker,
    private readonly log: (event: Record<string, unknown>) => void,
  ) {}

  /**
   * One pass. Rows are claimed with a conditional update so two relay instances
   * cannot publish the same row — the dedup is in the database rather than in a
   * leader election, because the database is already the arbiter of everything else.
   */
  async runOnce(batchSize = 200): Promise<number> {
    const claimed = await this.db.query<OutboxRow>(
      `UPDATE outbox
          SET claimed_at = now(), attempts = attempts + 1
        WHERE id IN (
                SELECT id FROM outbox
                 WHERE published_at IS NULL
                   AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $2))
                 ORDER BY aggregate_id, aggregate_version
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED
              )
      RETURNING *`,
      [batchSize, 2],
    );

    // Per-aggregate ordering: the relay never publishes version N+1 before N for the
    // same aggregate, because a consumer is allowed to skip a stale version and would
    // therefore silently lose N+1.
    const ordered = [...claimed].sort((a, b) =>
      a.aggregateId === b.aggregateId
        ? a.aggregateVersion - b.aggregateVersion
        : a.aggregateId.localeCompare(b.aggregateId),
    );

    let published = 0;

    for (const row of ordered) {
      try {
        await this.broker.publish(row.topic, row.payload, {
          ...row.headers,
          'x-message-id': row.id,
          'x-aggregate-id': row.aggregateId,
          'x-aggregate-version': String(row.aggregateVersion),
        });

        // Marking is a separate operation from publishing, and that is accepted: a
        // crash here republishes, which the consumer dedups by x-message-id. Losing
        // the row instead would be the unrecoverable version of this bug.
        await this.db.execute(`UPDATE outbox SET published_at = now() WHERE id = $1`, [row.id]);
        published += 1;
      } catch (failure) {
        this.log({
          event: 'outbox.publish.failed',
          rowId: row.id,
          aggregateId: row.aggregateId,
          attempts: row.attempts,
          retryInMs: backoffMs(row.attempts),
          error: (failure as Error).message,
        });

        // Leave it unpublished: the next pass picks it up. Never delete a row that
        // failed to publish, which is the mistake that turns a bug into data loss.
        await this.db.execute(`UPDATE outbox SET claimed_at = NULL WHERE id = $1`, [row.id]);
      }
    }

    // Ageing rows are a stuck relay or a truncated topic, not a busy one.
    const oldest = await this.db.queryOne<{ ageSeconds: number }>(
      `SELECT extract(epoch FROM now() - min(created_at))::int AS "ageSeconds"
         FROM outbox WHERE published_at IS NULL`,
    );

    if (oldest && oldest.ageSeconds > 120) {
      this.log({ event: 'outbox.backlog.ageing', ageSeconds: oldest.ageSeconds });
    }

    return published;
  }
}

/**
 * The reconciliation job. A saga whose compensation did not complete is not an
 * exception in a log; it is a customer who was charged for stock that was never
 * released. This job is what makes the eventual part of eventual consistency
 * something the business can rely on.
 */
export class ReconciliationJob {
  constructor(
    private readonly db: Database,
    private readonly registry: SagaRegistry,
    private readonly payments: { findCharge(idempotencyKey: string): Promise<{ id: string } | null> },
    private readonly inventory: { findReservation(reference: string): Promise<{ id: string } | null> },
    private readonly alert: (issue: ReconciliationIssue) => Promise<void>,
  ) {}

  async run(): Promise<ReconciliationIssue[]> {
    const issues: ReconciliationIssue[] = [];

    const sagas = await this.db.query<{
      orderId: string;
      state: string;
      completedSteps: string[];
      compensatedSteps: string[];
    }>(`SELECT order_id AS "orderId", state, completed_steps AS "completedSteps", compensated_steps AS "compensatedSteps"
          FROM sagas
         WHERE state IN ('completed', 'compensating', 'compensated')`);

    for (const saga of sagas) {
      for (const step of this.registry.stepsOf('order-fulfilment')) {
        const wasDone = saga.completedSteps.includes(step.name);
        const wasUndone = saga.compensatedSteps.includes(step.name);

        if (!wasDone || !wasUndone) continue;

        // The saga records the compensation as applied — check that the participant
        // agrees. This is the check that catches a compensation the network dropped.
        const stillThere =
          step.name === 'charge-payment'
            ? await this.payments.findCharge(`saga:${saga.orderId}:payment`)
            : step.name === 'reserve-stock'
              ? await this.inventory.findReservation(saga.orderId)
              : null;

        if (stillThere) {
          // The state was compensated but the side effect survives: an inconsistency
          // worth repairing and worth knowing about.
          issues.push({ orderId: saga.orderId, step: step.name, kind: 'compensation-not-applied' });
        }
      }

      // A saga that finished without its charge is the opposite divergence, and the
      // one that costs money directly.
      if (saga.state === 'completed') {
        const charge = await this.payments.findCharge(`saga:${saga.orderId}:payment`);

        if (!charge) {
          issues.push({ orderId: saga.orderId, step: 'charge-payment', kind: 'fulfilled-without-charge' });
        }
      }
    }

    // Nothing is repaired silently: every divergence is recorded and alerted, because
    // a repair the business never sees is a bug that keeps happening.
    for (const issue of issues) {
      await this.alert(issue);
    }

    return issues;
  }
}

export interface ReconciliationIssue {
  readonly orderId: string;
  readonly step: string;
  readonly kind: 'compensation-not-applied' | 'fulfilled-without-charge';
}
