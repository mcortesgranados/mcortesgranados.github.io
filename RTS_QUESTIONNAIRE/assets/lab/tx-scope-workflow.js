/**
 * tx-scope-workflow.js — live proof logic for RTS questionnaire Q36.
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
   * Each operation is one scope of consistency, from the transaction inside a
   * single database to the convergent guarantee across services, plus the read
   * model that sits on top of the boundary.
   */
  var OPERATIONS = {
    local: {
      label: 'One use case, one ACID transaction',
      command: 'EF Core: DbContext + one SaveChangesAsync inside an explicit transaction  \u00b7  ADO.NET: BeginTransaction for multi-statement work',
      effect: 'Inside one database a use case gets a real ACID boundary: the aggregate is loaded, changed and committed once. An explicit transaction is opened only where the work spans several statements or several aggregates, because opening one out of habit means holding locks for longer than the work actually needs.',
      output: 'use cases with exactly one commit: 100%\ntransactions that wrap a network call: 0\nSaveChanges calls per use case: 1\ntransactions opened just in case: 0'
    },
    isolation: {
      label: 'Isolation chosen, not defaulted',
      command: 'read committed by default  \u00b7  snapshot for long reads  \u00b7  serializable only where an invariant demands it  \u00b7  RCSI on SQL Server',
      effect: 'The default is read committed, because it is the level whose costs I can state. Snapshot is chosen where a report needs a stable view without blocking writers, serializable only where an invariant genuinely requires it, and each choice is documented with its cost: blocking, version-store growth, or retries under conflict.',
      output: 'isolation levels in use: 3, each with a written reason\nRCSI enabled: yes (readers do not block writers)\nretry-on-deadlock around serializable work: yes\nchosen per use case: yes, not a database-wide setting'
    },
    inprocess: {
      label: 'In-process consistency',
      command: 'rowversion optimistic concurrency  \u00b7  a unique constraint as the last line of defence  \u00b7  deadlock-aware retry  \u00b7  short transactions',
      effect: 'Optimistic concurrency with a row version is the default, because conflicts are rare and lock contention is expensive. A unique constraint stays even when the application already checks, because it is the only check that survives two concurrent requests. Deadlocks are retried with jitter instead of being feared, and transactions are kept short so locks are released quickly.',
      output: 'lost updates after concurrent edits: 0\ninvariants protected by a constraint as well as by code: yes\nretries on deadlock: automatic, jittered, with a bounded budget\naverage transaction duration: under 50 ms'
    },
    crossservice: {
      label: 'Across services',
      command: 'no distributed locks  \u00b7  outbox for state + event  \u00b7  saga with compensations  \u00b7  idempotent consumers  \u00b7  reconciliation',
      effect: 'Across a service boundary the guarantee changes from atomic to convergent, and the design changes with it: the outbox makes the state change and its event atomic in one local transaction, the saga rolls a business process back through compensations instead of a lock, consumers are idempotent because delivery is at-least-once, and reconciliation detects the divergence that escapes. There is no distributed lock anywhere in the design.',
      output: 'distributed locks in the design: 0\ndivergence detected by: a reconciliation job with an owner, not by a customer\nconsistency guarantee: convergent, with divergence made visible\nmechanism detail: on the Q35 proof page'
    },
    readmodel: {
      label: 'Read models and the boundary rule',
      command: 'projections rebuilt from the event log  \u00b7  materialised views  \u00b7  read-your-own-writes in the UI',
      effect: 'The read model is derived, so it is rebuilt from the log rather than patched in place, and its progress is a checkpoint that can be replayed. Where a user would notice the lag, the UI returns the accepted command id and streams the status instead of showing a stale list, which is a UX decision as much as a consistency one. The rule behind all of it: strong consistency inside the boundary, well-governed eventual consistency across it.',
      output: 'projections rebuildable from the log: all of them\nread-model divergences repaired by replay: yes\nstale state shown to a user after their own write: 0\ndivergence detectable in: minutes (traces and lag alerts), not at month-end'
    }
  };

  var DEFAULT_OPERATION = 'local';

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

    root.querySelector('[data-testid="tx-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="tx-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="tx-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('tx-scope-workflow');
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

  global.TxScopeWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
