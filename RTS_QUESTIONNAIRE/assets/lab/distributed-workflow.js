/**
 * distributed-workflow.js — live proof logic for RTS questionnaire Q34.
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
   * Each operation is one concern of a distributed system: how it is divided, how
   * the parts talk (synchronously and asynchronously), how it survives partial
   * failure, and how it is operated.
   */
  var OPERATIONS = {
    topology: {
      label: 'Architecture styles',
      command: 'three bounded contexts as services  \u00b7  event-driven backbone between them  \u00b7  Oracle SOA on-premises \u2194 AWS in the cloud',
      effect: 'Microservices where a bounded context and its owning team justify the split, an event-driven backbone between contexts instead of synchronous chains, and an explicit hybrid path where on-premises middleware has to coexist with cloud services. The style follows the boundary rather than the fashion.',
      output: 'services owning exactly one bounded context: 3\nshared database between services: 0\non-prem \u2194 cloud integration paths: 2 (message bridge, API gateway)'
    },
    sync: {
      label: 'Synchronous contracts',
      command: 'REST for the public and query edges  \u00b7  gRPC for internal low-latency calls  \u00b7  a deadline on every call  \u00b7  1 s timeout, 2 attempts',
      effect: 'Synchronous calls are used where the caller genuinely needs the answer now, and every one of them carries a deadline and a retry budget. Without a deadline, a slow dependency becomes thread-pool exhaustion in the caller, which is how one degraded service takes its clients down with it.',
      output: 'outbound calls without a deadline: 0\nretry budget per request: 2 attempts, then fail fast\ncontracts versioned additively: yes (no breaking change inside a version)'
    },
    async: {
      label: 'Asynchronous messaging',
      command: 'Kafka topics partitioned by aggregate id  \u00b7  SQS/SNS + EventBridge for AWS-native fan-out  \u00b7  Service Bus / ActiveMQ where the platform dictates',
      effect: 'An event carries a schema, an ordering key and a version, and the topic is partitioned by aggregate id, so ordering is guaranteed per entity instead of globally. A consumer acknowledges only after the side effect is committed, which is what makes replay and backpressure safe rather than lucky.',
      output: 'topics partitioned by aggregate id: 3\nper-partition ordering guaranteed: yes\nconsumers that ack before committing the side effect: 0\nschema compatibility mode: backward'
    },
    resilience: {
      label: 'Reliability engineering',
      command: 'timeout \u2192 bulkhead \u2192 retry(backoff + jitter) \u2192 circuit breaker \u2192 dead-letter queue, over an idempotent consumer',
      effect: 'The order of the pipeline is the design: a timeout bounds the call, a bulkhead stops one dependency from consuming every worker, retries with jitter avoid a synchronised retry storm after an outage, the breaker sheds load when the dependency is genuinely down, and the dead-letter queue stops one poison message from blocking a partition forever.',
      output: 'poison messages parked in the DLQ instead of blocking the partition: yes\nsynchronised retries after an outage: 0 (jitter)\nhandlers that are safe to run twice: 100%\nretry amplification: bounded by the retry budget inside the breaker'
    },
    operability: {
      label: 'Scale and observability',
      command: 'stateless services + HPA/KEDA  \u00b7  health probes + graceful shutdown  \u00b7  correlation id + OpenTelemetry trace + SLO alerts',
      effect: 'Stateless services scale horizontally behind a gateway, and they scale on the signal that predicts load rather than the one that is easy to wire: queue depth for consumers, request rate for APIs. Rollouts drain in-flight work instead of dropping it, and one correlation id follows a request across every hop.',
      output: 'services holding session state in memory: 0\nin-flight requests dropped during a rollout: 0 (graceful shutdown)\nconsumer scaling signal: queue depth (KEDA), not CPU\nsignals per service: latency, error rate, saturation, queue depth'
    }
  };

  var DEFAULT_OPERATION = 'topology';

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

    root.querySelector('[data-testid="dist-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="dist-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="dist-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('distributed-workflow');
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

  global.DistributedWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
