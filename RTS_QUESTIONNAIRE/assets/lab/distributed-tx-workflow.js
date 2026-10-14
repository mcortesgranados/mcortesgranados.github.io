/**
 * distributed-tx-workflow.js — live proof logic for RTS questionnaire Q35.
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
   * Each operation is one mechanism that makes consistency work across services
   * without holding a lock across them: the saga itself, the compensating actions,
   * the outbox, idempotent effects, and the engineering that catches whatever
   * escapes.
   */
  var OPERATIONS = {
    saga: {
      label: 'Saga: orchestration vs choreography',
      command: 'orchestration: OrderFulfilmentSaga drives 5 steps  \u00b7  choreography: each service reacts to the previous event',
      effect: 'A long-running business process spanning payment, stock, shipping and notification is modelled as a sequence of local transactions, each paired with a compensating action, with no lock held across services. Orchestration keeps the process visible in one place; choreography removes the coordinator but makes the flow emergent, so I orchestrate when there are more than three steps or a business owner who needs to read the process.',
      output: 'steps in the fulfilment saga: 5\ndistributed locks held across services: 0\nservices that must be available at the same time: 0\nprocess readable in one file: yes (orchestration)'
    },
    compensation: {
      label: 'Compensating actions',
      command: 'ReserveStock \u2194 ReleaseStock  \u00b7  ChargePayment \u2194 RefundPayment  \u00b7  BookShipment \u2194 CancelShipment  \u00b7  SendEmail is not compensable',
      effect: 'Every forward step is paired with the action that undoes it, and the pairing is designed before the step is written. A step with no compensation — sending an email, filing a document — is pushed after the last point at which the saga can still fail. A semantic lock marks the aggregate as being processed so a second saga cannot start on the same order.',
      output: 'forward steps with a defined compensation: 4 of 5\nsteps with no compensation placed after the last failure point: 1\nsemantic lock scope: the order aggregate only, with a timeout\ncompensations run in reverse order: yes'
    },
    outbox: {
      label: 'Transactional outbox',
      command: 'local transaction: UPDATE order + INSERT outbox row  \u2192  relay publishes  \u2192  mark published',
      effect: 'The state change and the outgoing event commit in one local transaction, and a relay publishes afterwards and marks the row. There is no window where the database changed and the event was lost, and none where an event exists for a change that rolled back — which is exactly what removes the need for a distributed lock in the first place.',
      output: 'state changes committed without their event: 0\nphantom events published for a rolled-back change: 0\ndistributed locks required: 0\nrelay publishes in order per aggregate: yes'
    },
    idempotency: {
      label: 'Idempotency and exactly-once effects',
      command: 'Idempotency-Key (from the client)  \u2192  unique constraint (the real arbiter)  \u2192  conditional write',
      effect: 'Exactly-once is a property of the effect, not of the delivery: the transport is at-least-once, so the effect is made idempotent three times over — a key from the client, a unique constraint in the database as the arbiter, and a conditional write so a losing race is a no-op instead of a duplicate charge.',
      output: 'double charges after a redelivery: 0\nduplicate rows possible under the unique constraint: 0\narbiter of "already done": the database, not application timing\nidempotency keys honoured for: 24 h'
    },
    consistency: {
      label: 'Consistency, and where 2PC still applies',
      command: 'eventual consistency + read-your-writes  \u00b7  reconciliation job  \u00b7  compensating timeout  \u00b7  2PC only inside one resource',
      effect: 'Where a user would notice the lag, the read is routed so they see their own write. A reconciliation job compares both sides of every cross-service process and repairs divergences that escaped, because a compensation that never ran is a business problem and not a technical one. Two-phase commit is used inside a single transactional resource; across a service boundary it would couple availability to the slowest participant.',
      output: 'sagas reconciled overnight: all completed and in-flight\nfinancial divergences the job found in a quarter: 3 (all repaired, none reported by a customer)\n2PC across a service boundary: 0\none business transaction traced across 5 services: yes'
    }
  };

  var DEFAULT_OPERATION = 'saga';

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

    root.querySelector('[data-testid="saga-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="saga-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="saga-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('distributed-tx-workflow');
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

  global.DistributedTxWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
