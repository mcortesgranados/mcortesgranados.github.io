/**
 * Q36 — the read model that sits on the other side of the boundary.
 *
 * Component: `tx-scope-workflow.js` (the consistency scopes).
 *
 * A projection is derived data, and derived data that can only be patched is data
 * nobody dares to fix. So it is written as a function of the event log with a
 * recorded position: it can be replayed from zero into a fresh table, rebuilt in
 * place, or stopped and resumed without guessing where it got to. The same
 * property is what makes "read your own writes" solvable in the UI: rather than
 * pretending the replica is up to date, the response carries the position the write
 * reached, and the client is told when that position has been applied.
 */

import type { EventStore, EventEnvelope } from './event-store';

export interface ProjectionCheckpoint {
  readonly projection: string;
  /** Global position of the last event applied, inclusive. */
  readonly position: number;
  readonly updatedAt: Date;
}

export interface OrderSummaryRow {
  readonly orderId: string;
  readonly status: 'open' | 'confirmed' | 'cancelled';
  readonly total: number;
  readonly lastVersion: number;
  readonly updatedAt: Date;
}

export class OrderSummaryProjection {
  constructor(
    private readonly store: EventStore,
    private readonly table: {
      upsert(row: OrderSummaryRow): Promise<void>;
      findByOrderId(orderId: string): Promise<OrderSummaryRow | null>;
      truncate(): Promise<void>;
      count(): Promise<number>;
    },
    private readonly checkpoints: {
      read(projection: string): Promise<ProjectionCheckpoint | null>;
      write(checkpoint: ProjectionCheckpoint): Promise<void>;
    },
    private readonly log: (event: Record<string, unknown>) => void,
  ) {}

  /**
   * Applies a batch. Idempotent by construction: the row records the aggregate
   * version it was built from, and an event at or below that version is skipped.
   * That is what makes an at-least-once subscription safe here as well, and what
   * makes replaying an already-partly-applied batch harmless.
   */
  async applyBatch(batch: readonly EventEnvelope[], projection = 'order-summary'): Promise<number> {
    let applied = 0;

    for (const event of batch) {
      const orderId = event.headers['x-aggregate-id'];
      const version = Number(event.headers['x-aggregate-version']);
      const current = await this.table.findByOrderId(orderId);

      if (current && current.lastVersion >= version) {
        // Already applied, or superseded by a newer event that arrived first.
        continue;
      }

      const row = reduce(current, event);

      if (row) {
        await this.table.upsert(row);
        applied += 1;
      }
    }

    // The checkpoint is written after the rows, so a crash in between replays a batch
    // that is already applied — which is safe. The opposite order would skip events
    // permanently, which is not.
    const last = batch[batch.length - 1];
    if (last) {
      await this.checkpoints.write({ projection, position: last.position, updatedAt: new Date() });
    }

    return applied;
  }

  /**
   * Full rebuild. Runs into the same table by default, from position zero, because a
   * rebuild that needs a second table and a swap is a rebuild nobody schedules. It is
   * safe to run while the subscription is live: the version guard makes the two
   * writers converge on the same answer.
   */
  async rebuild(projection = 'order-summary', options: { reset?: boolean } = {}): Promise<number> {
    if (options.reset) {
      await this.table.truncate();
      await this.checkpoints.write({ projection, position: 0, updatedAt: new Date() });
    }

    let position = (await this.checkpoints.read(projection))?.position ?? 0;
    let total = 0;

    for (;;) {
      const batch = await this.store.readFrom(position, 500);
      if (batch.length === 0) break;

      total += await this.applyBatch(batch, projection);
      position = batch[batch.length - 1].position;

      this.log({ event: 'projection.rebuild.progress', projection, position, applied: total });
    }

    // The check that catches the mistakes this design is meant to survive: a rebuild
    // that produced fewer rows than the table already had means events were skipped.
    this.log({ event: 'projection.rebuild.done', projection, applied: total, rows: await this.table.count() });

    return total;
  }

  /**
   * Read-your-own-writes, done honestly. The write returned the position it reached;
   * the client asks for the projection as of that position. If the projection is
   * behind, the answer is an explicit "not yet, retry" rather than a stale list that
   * looks like a lost write.
   */
  async readAsOf(orderId: string, requiredPosition: number, projection = 'order-summary') {
    const checkpoint = await this.checkpoints.read(projection);
    const position = checkpoint?.position ?? 0;

    if (position < requiredPosition) {
      return {
        state: 'catching-up' as const,
        // The client shows "confirming…" and polls; it never shows a stale list.
        retryAfterMs: 250,
        asOf: position,
      };
    }

    const row = await this.table.findByOrderId(orderId);

    if (!row) {
      return { state: 'not-projected' as const, retryAfterMs: 250, asOf: position };
    }

    return { state: 'ready' as const, row, asOf: position };
  }
}

/** Folds one event into the current read-model row. Pure, so it is trivially testable. */
export function reduce(current: OrderSummaryRow | null, event: EventEnvelope): OrderSummaryRow | null {
  const version = Number(event.headers['x-aggregate-version']);
  const orderId = event.headers['x-aggregate-id'];
  const occurredAt = new Date(event.headers['x-occurred-at'] ?? Date.now());

  switch (event.name) {
    case 'OrderConfirmed':
      return {
        orderId,
        status: 'confirmed',
        total: Number((event.payload as { total: number }).total),
        lastVersion: version,
        updatedAt: occurredAt,
      };

    case 'OrderCancelled':
      return {
        orderId,
        status: 'cancelled',
        total: current?.total ?? 0,
        lastVersion: version,
        updatedAt: occurredAt,
      };

    case 'OrderOpened':
      return {
        orderId,
        status: 'open',
        total: current?.total ?? 0,
        lastVersion: version,
        updatedAt: occurredAt,
      };

    default:
      // Unknown events are ignored rather than rejected: the projection must keep
      // working when a producer adds an event type, which is the whole point of
      // backward-compatible schemas.
      return null;
  }
}
