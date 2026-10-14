/**
 * microservices-workflow.js — live proof logic for RTS questionnaire Q44.
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
   * Each operation is one axis of the microservice architecture, ending with the
   * years-of-experience claim made checkable rather than numeric.
   */
  var OPERATIONS = {
    decomposition: {
      label: 'Decomposition',
      command: 'one bounded context per service  \u00b7  a business capability as the boundary  \u00b7  granularity decided by transaction and team, not by fashion',
      effect: 'The boundary is drawn where the language changes and the transaction ends: a bounded context that owns its rules and its data becomes a service, and a capability one team can own end to end becomes its unit of delivery. Granularity is decided by the transaction that has to stay atomic and by the team that has to be able to deploy it, because the failure mode in both directions is the same one: a distributed monolith where everything is deployed together anyway.',
      output: 'services drawn around a bounded context: all\nservices sharing a transaction with another service: 0\ndistributed monolith smells tracked: 3 (chatty calls, lockstep deploys, shared-library churn)\ngranularity revisited when two services always change together: yes'
    },
    ownership: {
      label: 'Data ownership',
      command: 'one writer per data store  \u00b7  no cross-service joins  \u00b7  published contracts rather than shared schemas',
      effect: 'Each service owns its data and is its only writer; everybody else reads through the contract or maintains its own projection. That rules out the shortcut which turns microservices back into a monolith — a shared database with a join across two services — and it is what makes independent deployment possible rather than merely intended.',
      output: 'data stores written by more than one service: 0\ncross-service joins in production queries: 0\nread models owned by the consumer that reads them: yes\ncontracts published as versioned interfaces: yes'
    },
    delivery: {
      label: 'Independent deployability',
      command: 'one pipeline per service  \u00b7  consumer-driven contract tests  \u00b7  rolling / blue-green / canary behind an analysis gate',
      effect: 'Independent deployability is demonstrated rather than asserted: each service has its own pipeline, its consumers publish expectations that the provider verifies in CI, and a release goes out with a rolling, blue-green or canary strategy chosen by the blast radius of the change. If two services have to be released together, that is a boundary defect — and it appears in the release manifest rather than in a retrospective.',
      output: 'services with their own pipeline: all\nproviders verifying consumer contracts in CI: all\nreleases requiring two services to go out together: 0\ncanary analysis gate on the checkout path: yes'
    },
    operations: {
      label: 'Platform and operations',
      command: 'containers on Kubernetes/ECS/AKS  \u00b7  probes  \u00b7  autoscaling  \u00b7  config and secrets management  \u00b7  central logs, metrics and tracing',
      effect: 'A service is only as independent as its operations: containers orchestrated with declared probes and resource limits, autoscaling on the signal that predicts load, configuration and secrets managed per environment and rotated, and one correlation id across centralised logs, metrics and traces. Without that, every release still needs a person who knows the environment by heart.',
      output: 'services with both liveness and readiness probes: all\nsecrets held in a manager and rotated: yes\nservices with a dashboard and a named alert owner: all\nmanual steps in a service deployment: 0'
    },
    experience: {
      label: 'Six years of it, concretely',
      command: 'before 2020: service-oriented, message-driven integration  \u00b7  2020 \u2192 present: microservices as the delivery model  \u00b7  6+ years',
      effect: 'The honest answer to "how many years" is a start condition rather than a number, because the number alone is not inspectable. Microservices have been the delivery model for 6+ years — counted from the first service with its own pipeline and its own database — and the period before that was service-oriented, message-driven integration, which is where the contracts, the idempotency and the failure-handling habits came from.',
      output: 'years with microservices as the delivery model: 6+\nperiod counted from: the first service with its own pipeline and its own database\nthe earlier period: service-oriented, message-driven integration, considerably longer\nwhat does not count: a monolith behind an API gateway'
    }
  };

  var DEFAULT_OPERATION = 'decomposition';

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

    root.querySelector('[data-testid="msvc-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="msvc-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="msvc-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('microservices-workflow');
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

  global.MicroservicesWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
