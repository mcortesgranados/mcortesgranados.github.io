/**
 * scaling-ladder-workflow.js — live proof logic for RTS questionnaire Q48.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static
 * page with no build step.
 *
 * Angular                              -> this static proof
 *   signal<CliTask>('serve')             -> the active operation stored in OPERATIONS
 *   computed(() => TASKS[selected()])    -> selectOperation() looks the detail up
 *   (click)="selectTask('build')"        -> button click listener
 *   [class.active]="..."                 -> classList.toggle('active', ...)
 *   {{ detail().command }} etc.          -> textContent on the data-testid nodes
 */
(function (global) {
  'use strict';

  /**
   * The scaling ladder, in the order it is climbed: measure, then the reversible
   * levers, and sharding last because it is the one that cannot be undone.
   */
  var OPERATIONS = {
    measure: {
      label: 'Measure before scaling',
      command: 'p95 and p99 latency  \u00b7  cache hit ratio per layer  \u00b7  replication lag  \u00b7  lock waits by type  \u00b7  the constraint named before the fix',
      effect: 'A scaling change answers a measured constraint rather than a feeling: the p95 and p99 of the endpoints that matter, the hit ratio of every cache layer, the replication lag in seconds, and the wait types holding work up on the database. The bottleneck is written down before anything changes, because a scaling change without a baseline is a change nobody can attribute a result to.',
      output: 'scaling decisions taken with a baseline: 100%\nconstraint named in writing before the change: yes\n"the database is slow" accepted as a diagnosis: never\nsignals watched: p95, p99, hit ratio, lag, lock waits, pool saturation'
    },
    replicas: {
      label: 'Read replicas and lag',
      command: 'read/write splitting  \u00b7  listings, reports and analytics on the replicas  \u00b7  read-after-write pinned to the primary  \u00b7  a lag budget with an alert',
      effect: 'Replicas take the read-heavy traffic that tolerates a stale answer \u2014 listings, reports, analytics \u2014 away from the primary, and every read path declares whether it tolerates lag. A read that follows a write the user just made is pinned to the primary or waits for the replica to catch up, and the lag itself is a monitored number with a budget rather than something discovered by a user.',
      output: 'read paths with a declared lag tolerance: all\nread-after-write paths pinned to the primary: all\nreplication lag budget: 2 s, alerted above it\nreplica lag available to the routing decision: yes'
    },
    cache: {
      label: 'Multi-layer caching',
      command: 'in-process memoisation  \u2192  Redis cache-aside and write-through  \u2192  HTTP response caching with validators  \u2192  CDN at the edge',
      effect: 'Caching is layered so that a hit at the cheapest layer costs nothing beyond it: in-process memoisation for the hottest immutable data, Redis with cache-aside for shared state and write-through where a stale read is unacceptable, HTTP caching with validators at the service boundary, and a CDN for anonymous traffic. Every entry declares its TTL, its invalidation contract and its stampede protection, and the hit ratio is measured per layer rather than assumed.',
      output: 'cache layers on a request path: up to 4, each with a measured hit ratio\nevery entry with a declared invalidation contract: all\nstampede protection: jittered TTLs plus a single-flight lock\ncaches with no hit-ratio metric: 0\ninvalidation contract written before the cache was added: yes'
    },
    offload: {
      label: 'Offload before sharding',
      command: 'CQRS read models  \u00b7  materialised views  \u00b7  partition switching and archival  \u00b7  connection pooling and batching  \u00b7  search and analytics moved off',
      effect: 'Before splitting anything there is a set of cheaper levers: a read model built for the expensive aggregation, a materialised view refreshed on a schedule, cold data archived by partition switch, pooling and batching to remove round trips, and search or analytics moved to an engine built for it. Together they frequently remove the need to shard at all, which is why they sit above it on the ladder.',
      output: 'expensive aggregations answered by a read model: all\nanalytics queries run against the transactional database: 0\ncold data still in the hot table: 0 (switched to the archive)\nround trips per screen: reduced by batching, measured before and after\nsearch served by a search engine rather than a LIKE scan: yes'
    },
    shard: {
      label: 'Sharding last, and NoSQL key design',
      command: 'shard key chosen from the access pattern  \u00b7  cross-shard cost written down  \u00b7  a rebalancing plan agreed before the first shard  \u00b7  in NoSQL, the distribution lives in the key',
      effect: 'Sharding is the last rung because it is the one that cannot be undone: every query becomes shard-local or a scatter-gather, transactions stop spanning shards, and the key choice is effectively permanent. So the key is chosen from the access pattern with the cross-shard cost written down, and the rebalancing plan is agreed before the first shard exists. In DynamoDB or Cassandra the same distribution is expressed directly in the partition key, which makes hot-partition avoidance there the same discipline under a different name.',
      output: 'rungs tried before sharding: 4\nshard keys chosen with a documented access pattern: 100%\nshard keys changed after going live: 0\nstatement transactions spanning shards: 0\nhot partitions found in design review: 3, before launch rather than after'
    }
  };

  var DEFAULT_OPERATION = 'measure';

  /**
   * Applies one operation to the DOM subtree of the workflow component.
   * Returns the detail object, or null when the operation is unknown.
   */
  function selectOperation(root, name) {
    var detail = OPERATIONS[name];
    if (!root || !detail) return null;

    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {
      var isActive = button.getAttribute('data-op') === name;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    root.querySelector('[data-testid="scale-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="scale-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="scale-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('scaling-ladder-workflow');
    if (!root) return;

    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {
      button.addEventListener('click', function () {
        selectOperation(root, button.getAttribute('data-op'));
      });
    });

    selectOperation(root, root.getAttribute('data-operation') || DEFAULT_OPERATION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ScalingLadderWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
