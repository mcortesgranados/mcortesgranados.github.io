/**
 * pattern-inventory-workflow.js — live proof logic for RTS questionnaire Q46.
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
   * The seven patterns the question lists, grouped into five operations so each one
   * states what was implemented, where, and for how long — the "how long" is answered
   * as a period counted from a condition rather than as a number on its own.
   */
  var OPERATIONS = {
    cqrs: {
      label: 'CQRS and Event Sourcing',
      command: 'write model: transactional, validated  \u00b7  read models: denormalised projections and materialised views  \u00b7  an append-only log where the history is the point',
      effect: 'CQRS is applied wherever the read shape and the write shape genuinely differ, and event sourcing only where the history is the point: financial movements, approvals, workflow history. The log becomes the source of truth, the write model validates and appends with an expected version, and every read model — including the ones behind the dashboards — is a projection that can be rebuilt from zero.',
      output: 'CQRS in production: 6+ years, wherever the read and write shapes differ\nEvent Sourcing in production: 6 years, applied selectively to audit-heavy domains\nprojections rebuildable from the log: all\nevent sourcing used on CRUD-shaped data: 0 places\njustification recorded per adoption: an ADR'
    },
    outbox: {
      label: 'Transactional Outbox and Idempotency',
      command: 'state and event in one local transaction  \u00b7  a relay publishes  \u00b7  an inbox with a dedup key  \u00b7  a conditional write',
      effect: 'The outbox and idempotency are one mechanism seen from two sides: the outbox makes the state change and its event atomic without a distributed transaction, and the inbox with a dedup key makes at-least-once delivery produce an exactly-once business effect. The alternatives — publishing inside the transaction, or trusting the delivery guarantee — produce a class of defect that only appears under load.',
      output: 'Transactional Outbox in production: 6 years (2020 \u2192 present), over Kafka, RabbitMQ and Service Bus\ninbox and dedup tables on the consumer side: every state-changing consumer\ndistributed transactions across a service boundary: 0\nduplicate business effects from a redelivery: 0'
    },
    saga: {
      label: 'Saga',
      command: 'orchestrated and choreographed  \u00b7  a compensating action per step  \u00b7  timeouts  \u00b7  a manual-intervention escape hatch',
      effect: 'Both styles are in production: orchestration where the process has a business owner who needs to read it, choreography where the participants are already event-driven and the flow is short. Every step carries a compensation designed with it, a timeout treats a silent participant as failed, and there is always an escape hatch — a queue a human can drain — because a compensation that cannot complete is a business problem rather than an exception.',
      output: 'Saga in production: 6 years (2020 \u2192 present), both orchestrated and choreographed\nsteps with a compensation designed alongside them: all\nsagas with an explicit timeout policy: all\nsagas with no manual-intervention path: 0\nstyle rule: orchestration at four steps and above, choreography below that'
    },
    eventdriven: {
      label: 'Event-driven architecture',
      command: 'topics and queues with a schema  \u00b7  versioned contracts  \u00b7  a named owning team per topic  \u00b7  replay and backlog observability',
      effect: 'Event-driven means the producer neither knows nor waits for its consumers: schemas are published and versioned, every topic has an owning team, consumers are replayable and the backlog is a first-class metric. It is chosen for decoupling rather than used as a default, because a system where everything is an event is a system where nothing has a clear owner.',
      output: 'event-driven in production: 6+ years — MQ systems before 2020, then Kafka, RabbitMQ, Service Bus and EventBridge\ntopics with a schema and a version: all\ntopics with a named owning team: all\nunowned shared topics: 0\nevery interaction modelled as an event: no — chosen per boundary'
    },
    resilience: {
      label: 'Retry, circuit breaker and bulkheads',
      command: 'exponential backoff with jitter  \u00b7  circuit breaker  \u00b7  bulkhead  \u00b7  timeout  \u00b7  fallback  \u00b7  a retry budget per call',
      effect: 'The policies are composed in a deliberate order — timeout outermost, then the bulkhead, then the retry, then the breaker — because a retry outside its bulkhead amplifies an outage, and a breaker outside its retry trips on a single exhausted request. Fallbacks are designed as degraded features rather than empty responses, and each one is exercised by a test instead of being trusted.',
      output: 'retry, circuit breaker and bulkhead in production: 6+ years, in both the pre-2020 and the current stacks\npolicies composed in a deliberate, tested order: all\nfallbacks returning a degraded feature rather than an error: all\nretry storms after an outage: 0 (jitter)\ncircuit breakers with a tested open state: all'
    }
  };

  var DEFAULT_OPERATION = 'cqrs';

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

    root.querySelector('[data-testid="pat-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="pat-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="pat-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('pattern-inventory-workflow');
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

  global.PatternInventoryWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
