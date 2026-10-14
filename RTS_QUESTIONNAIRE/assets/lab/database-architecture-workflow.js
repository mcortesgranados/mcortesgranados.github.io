/**
 * database-architecture-workflow.js — live proof logic for RTS questionnaire Q47.
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
   * The six areas the question names, as five operations: the model, the keys, the
   * indexes, the partitions, and the topology plus the triage discipline that validates
   * every one of the others.
   */
  var OPERATIONS = {
    model: {
      label: 'ER modelling and schema evolution',
      command: 'conceptual \u2192 logical \u2192 physical  \u00b7  3NF with justified denormalisation  \u00b7  temporal history for audited tables  \u00b7  versioned, forward-only migrations',
      effect: 'The model is built in three passes, each for a different audience: the conceptual one with the business, the logical one normalised to third normal form with every denormalisation written down beside the read it serves, and the physical one with types, partitioning and the index set. History is a design decision rather than an afterthought, because reconstructing what a row looked like in March is impossible if nobody kept the log.',
      output: 'denormalisations applied: 3, each with the query it serves\nrows that can dangle because only the application checks: 0\nhistory reconstructable for the audited tables: all of it\nmigrations: forward-only, versioned, applied by CI\ndestructive migration shipped without a backfill plan: 0'
    },
    keys: {
      label: 'Keys, constraints and the distribution key',
      command: 'a surrogate primary key plus the natural unique key  \u00b7  constraints as the last line of defence  \u00b7  the partition/shard key chosen from the access pattern',
      effect: 'A table carries both a surrogate primary key, so a reference stays stable when the business identifier changes, and the natural unique key that makes the duplicate impossible rather than unlikely. The partition or shard key is a schema decision taken with the access pattern in front of it: a key that spreads writes but makes every read cross-partition is a worse design than the one it replaced, so the cross-shard cost is written down before the key is chosen.',
      output: 'business tables with a natural unique key beside the surrogate: all\ninvariants enforced only in application code: 0\nshard keys chosen without a documented access pattern: 0\ncross-shard reads on a hot path: 0\nhot tenant-scoped queries touching one partition: 100%'
    },
    indexes: {
      label: 'Index design from query patterns',
      command: 'the query inventory first  \u00b7  composite in equality-then-range order  \u00b7  covering with INCLUDE  \u00b7  filtered for the sparse predicate  \u00b7  maintained, not accumulated',
      effect: 'Indexes are derived from an inventory of the queries that actually run, in their real shapes and frequencies, instead of from the column list of the table. The composite order puts the equality predicates before the range, INCLUDE carries the projected columns so the read is answered from the index alone, a filtered index covers the sparse predicate that would otherwise scan, and every decision is checked against an execution plan before and after — because an index nobody measures is an index that costs writes and buys nothing.',
      output: 'hot queries answered by a seek: all\nindexes with no query that uses them: 0 (removed: they cost writes)\nindex decisions validated with a before-and-after plan: all\nfragmentation and statistics maintained on a schedule: yes\nwrite cost of the index set measured: yes'
    },
    partition: {
      label: 'Partitioning and archiving',
      command: 'range by date, list by tenant, hash for an even spread  \u00b7  partition switching for archive and purge  \u00b7  partition-aware queries',
      effect: 'Partitioning is used for manageability first and performance second: a range partition by date turns archiving into a metadata switch instead of a delete that locks and bloats, and a list partition by tenant makes a large customer addressable on their own. The queries have to follow the scheme, because a predicate that omits the partition key reads every partition and the design pays for nothing at all.',
      output: 'archiving mechanism: partition switch, not a bulk DELETE\ntime to purge a 40 GB month: seconds, with no lock on the live partition\nhot-path queries that omit the partition key: 0\npartitions per table before a review: 200'
    },
    topology: {
      label: 'Replication, recovery and triage',
      command: 'primary/standby with streaming replication and log shipping  \u00b7  failover that has been executed  \u00b7  PITR verified against a real restore  \u00b7  every slow query triaged from its plan',
      effect: 'The topology follows the recovery objective: what the business can afford to lose and how long it can be unavailable, which is what decides between asynchronous streaming, synchronous commit and log shipping. A failover that has never been executed is a plan rather than a capability, so the drills are scheduled and timed, point-in-time recovery is verified against a real backup, and a slow query is triaged from its execution plan and its statistics rather than from a hunch.',
      output: 'recovery objective stated per database: RPO and RTO agreed with the business\nfailover drills: quarterly, timed, with the measured duration recorded\npoint-in-time recovery verified against a real restore: yes\nslow queries triaged from the plan: 100%\ncapacity decisions based on measured load: all'
    }
  };

  var DEFAULT_OPERATION = 'model';

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

    root.querySelector('[data-testid="dba-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="dba-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="dba-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('database-architecture-workflow');
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

  global.DatabaseArchitectureWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
