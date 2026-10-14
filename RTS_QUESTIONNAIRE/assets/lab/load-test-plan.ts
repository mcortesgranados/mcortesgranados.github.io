/**
 * Q48 — the load test that validates a scaling change before it ships.
 *
 * Component: `scaling-ladder-workflow.js` (the scaling ladder).
 *
 * A scaling decision is a hypothesis until it is exercised: "the replica will absorb the
 * read traffic", "the cache will hold at 3x traffic", "the new instance size is enough".
 * This plan is the artefact that turns each of those into something measured, and the
 * reason it is checked in rather than run by hand is that the last step — recording the
 * result against the decision — is the step everybody skips.
 *
 * Two scenarios are deliberately unpleasant: an empty cache, because a cold start after
 * a deploy is when the database learns what the cache was carrying, and a cache that has
 * failed entirely, because a system that breaks when its cache disappears is a system
 * whose cache is load-bearing infrastructure without a plan.
 */

export interface LoadStage {
  readonly name: string;
  readonly duration: string;
  /** Requests per second at the end of the stage. */
  readonly targetRps: number;
  /** How the ramp reaches it: instantly exposes a stampede, gradually exposes a leak. */
  readonly ramp: 'instant' | 'linear' | 'step';
}

export interface SuccessCriterion {
  readonly metric: string;
  readonly threshold: string;
  readonly scope: 'endpoint' | 'database' | 'cache' | 'system';
}

export interface ScalingLoadTest {
  readonly name: string;
  /** The decision this test exists to validate, recorded with the rung of the ladder. */
  readonly decision: string;
  readonly ladderRung: 'measure' | 'cache' | 'read-replica' | 'offload' | 'shard';
  readonly baseline: { p95Ms: number; p99Ms: number; rps: number };
  readonly stages: readonly LoadStage[];
  readonly conditions: readonly string[];
  readonly successCriteria: readonly SuccessCriterion[];
  readonly rollbackTrigger: readonly string[];
}

export const READ_REPLICA_ROLLOUT: ScalingLoadTest = {
  name: 'orders-read-replica-rollout',
  decision:
    'route lag-tolerant reads (order lists, catalogue, reports) to two replicas, ' +
    'and keep read-your-writes reads on the primary — expected to move 62% of read traffic off the primary',
  ladderRung: 'read-replica',
  baseline: { p95Ms: 240, p99Ms: 610, rps: 850 },

  stages: [
    { name: 'warm-up', duration: '5 min', targetRps: 300, ramp: 'linear' },
    // The stage that matters most: the traffic the replica is supposed to take away.
    { name: 'expected-peak', duration: '20 min', targetRps: 1400, ramp: 'linear' },
    // Double the peak, because the capacity discussion is always about the peak.
    { name: 'headroom', duration: '15 min', targetRps: 2800, ramp: 'step' },
    // Redis loses a node: the request path must get slower, not broken.
    { name: 'cache-degraded', duration: '10 min', targetRps: 1400, ramp: 'step' },
    // Empty cache at full traffic: the cold-start scenario that a deploy produces.
    { name: 'cold-cache', duration: '10 min', targetRps: 1400, ramp: 'instant' },
    { name: 'replica-lag-injected', duration: '10 min', targetRps: 1400, ramp: 'step' },
  ],

  conditions: [
    'seeded at production volume, not at a representative sample: a plan taken against a small table is a different plan',
    'cache warm for the first two stages, emptied before cold-cache, and failed for cache-degraded',
    'replication lag injected deliberately in the last stage to prove the routing falls back rather than serving stale reads',
    'one replica taken out of the pool mid-test, because that happens during maintenance windows',
  ],

  successCriteria: [
    { metric: 'order list p95', threshold: 'under 300 ms at expected peak', scope: 'endpoint' },
    { metric: 'order list p99', threshold: 'under 900 ms at expected peak', scope: 'endpoint' },
    { metric: 'read-your-writes correctness', threshold: 'zero reads of a stale order after the caller\'s own write', scope: 'endpoint' },
    { metric: 'primary read traffic', threshold: 'reduced by at least 50% against the baseline', scope: 'database' },
    { metric: 'replica lag', threshold: 'under the 2 s budget at expected peak; routing falls back to the primary above it', scope: 'database' },
    { metric: 'error rate', threshold: 'under 0.1% in every stage including cold-cache', scope: 'system' },
    { metric: 'cache hit ratio', threshold: 'above the per-entry target once warm', scope: 'cache' },
    { metric: 'behaviour with no cache', threshold: 'slower and correct, never failing', scope: 'system' },
    { metric: 'connection pool saturation', threshold: 'under 80% at headroom', scope: 'database' },
  ],

  rollbackTrigger: [
    'error rate above 0.5% in any stage',
    'p99 beyond the baseline by more than 30% at expected peak',
    'a single read-your-writes violation',
    'replica lag sustained beyond the budget with the fallback not engaging',
    'cache hit ratio below target with the primary load above baseline',
  ],
};

/**
 * The record. Every scaling change is reported with the rung it represents, the decision
 * it was validating and the measured result, so the next person can see whether the
 * ladder is being climbed deliberately or by habit.
 */
export interface ScalingDecisionRecord {
  readonly date: string;
  readonly rung: ScalingLoadTest['ladderRung'];
  readonly decision: string;
  readonly before: { p95Ms: number; p99Ms: number; rps: number };
  readonly after: { p95Ms: number; p99Ms: number; rps: number };
  readonly costDelta: string;
  readonly outcome: 'kept' | 'rolled-back' | 'partially-kept';
  readonly notes: string;
}

export const SCALING_LOG: readonly ScalingDecisionRecord[] = [
  {
    date: '2026-02',
    rung: 'cache',
    decision: 'add a distributed cache for the catalogue read path with a 10 min TTL and invalidation on ProductUpdated',
    before: { p95Ms: 240, p99Ms: 610, rps: 850 },
    after: { p95Ms: 120, p99Ms: 280, rps: 850 },
    costDelta: 'one Redis node',
    outcome: 'kept',
    notes: 'hit ratio settled at 96%; the invalidation handler was the part that needed the test, not the cache',
  },
  {
    date: '2026-05',
    rung: 'read-replica',
    decision: 'route lag-tolerant reads to two replicas and pin read-your-writes to the primary',
    before: { p95Ms: 120, p99Ms: 280, rps: 1400 },
    after: { p95Ms: 110, p99Ms: 250, rps: 2400 },
    costDelta: 'two replicas',
    outcome: 'kept',
    notes: 'primary read traffic down 62%; the lag budget and the fallback were exercised in the injected-lag stage',
  },
  {
    date: '2026-08',
    rung: 'offload',
    decision: 'move the daily sales aggregation to a read model refreshed on a schedule instead of a live aggregate over the transactional tables',
    before: { p95Ms: 110, p99Ms: 250, rps: 2400 },
    after: { p95Ms: 105, p99Ms: 240, rps: 2400 },
    costDelta: 'none: a projection in the reporting database',
    outcome: 'kept',
    notes: 'the report itself got slower by seconds and stopped competing with checkout; the trade-off was accepted in writing',
  },
  {
    date: '2026-09',
    rung: 'shard',
    // A deliberate non-decision, recorded as such: "we did not shard, and here is the
    // evidence and the date on which that judgement was made" is more useful than an
    // absence, because the next review starts from it.
    decision: 'not taken: the four rungs above absorbed the projected growth for the next 18 months',
    before: { p95Ms: 105, p99Ms: 240, rps: 2400 },
    after: { p95Ms: 105, p99Ms: 240, rps: 2400 },
    costDelta: 'none',
    outcome: 'kept',
    notes: 'the shard key and the cross-shard cost were designed and documented anyway, so the decision to defer is reversible rather than absent',
  },
];
