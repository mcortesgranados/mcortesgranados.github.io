/**
 * service-fabric-workflow.js — live proof logic for RTS questionnaire Q45.
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
   * The five nouns of the question, one operation each: how services talk, what the
   * gateway owns, how identity travels between them, how they find each other, and
   * how work is spread across the processes that do it.
   */
  var OPERATIONS = {
    comm: {
      label: 'Service-to-service communication',
      command: 'typed HTTP clients with a deadline  \u00b7  gRPC where latency and throughput matter  \u00b7  asynchronous messaging for decoupled flows',
      effect: 'The default is a typed client over REST carrying a deadline and a retry policy, because it is debuggable and every team already has the tooling. gRPC is used where the call is internal, chatty and latency-sensitive, contract-first so the schema is the interface. Anything that does not need an answer right now goes to a message, because a synchronous chain couples the availability of two services.',
      output: 'synchronous hops to serve one user request: at most 3\noutbound calls without a deadline: 0\nclients generated from a contract: all\ntransport choice recorded per edge: yes'
    },
    gateway: {
      label: 'API gateways',
      command: 'routing  \u00b7  authentication offload  \u00b7  per-consumer rate limits  \u00b7  request and response transformation  \u00b7  canary routing',
      effect: 'The gateway owns what every service would otherwise repeat: TLS termination, routing, token validation at the edge, rate limiting per consumer, request size limits, correlation id injection and canary traffic splitting. It holds no business logic, because logic in a gateway cannot be unit tested, versioned or rolled back with the service that owns the rule.',
      output: 'business rules implemented in the gateway: 0\nrate limits: defined per consumer key, not one global limit\ncorrelation id injected at the edge: yes\ncanary routing by weight: yes\nretries at the gateway: idempotent methods only'
    },
    identity: {
      label: 'Authentication and authorization',
      command: 'OAuth2/OIDC at the edge  \u00b7  JWT propagated with its scopes  \u00b7  client credentials or mTLS for internal calls  \u00b7  secrets in a vault',
      effect: 'The user authenticates once at the edge; the token carries the scopes and the tenant, and each service enforces its own policy rather than trusting the caller. A service-to-service call made on behalf of a user propagates that identity where accountability matters, while a pure machine call uses client credentials or mTLS with its own scopes. No credential ever lives in a configuration file.',
      output: 'services that trust a caller without validating its token: 0\nscopes enforced per operation rather than per service: all\nmachine calls authenticated by client credentials or mTLS: all\ncredentials held in configuration files: 0'
    },
    discovery: {
      label: 'Service discovery and resilience',
      command: 'DNS through Kubernetes Services  \u00b7  registries (Consul/Eureka) in earlier stacks  \u00b7  client-side load balancing  \u00b7  health checks and degradation',
      effect: 'On a modern platform discovery is a DNS problem: a Kubernetes Service resolves to healthy endpoints and unready pods are taken out of rotation, which is why a client-side registry only earns its place where the platform does not provide one. Load balancing is client-side where retries need to land elsewhere, health is a first-class signal rather than a ping, and an unhealthy dependency degrades one feature instead of failing the request.',
      output: 'static host lists in configuration: 0\nreadiness gate before an instance receives traffic: yes\ndependencies that degrade instead of failing the request: 4 of 5\ncalling a moved instance without a client redeploy: yes'
    },
    processing: {
      label: 'Distributed processing',
      command: 'partitions and consumer groups  \u00b7  ordering by aggregate key  \u00b7  parallelism bounded by partitions  \u00b7  replay and DLQ',
      effect: 'Throughput comes from partitions and consumer groups rather than from a bigger worker: parallelism is bounded by the partition count, ordering is preserved per key rather than globally, and adding a consumer triggers a rebalance the handler has to survive. A dead-letter queue with a written replay procedure is what makes a poison message a recoverable event rather than a terminal one.',
      output: 'parallelism bounded by the partition count: yes, stated per topic\nordering guaranteed per aggregate key: yes\nglobally ordered topics: 0\nconsumers that survive a rebalance: all\ntopics with a documented replay procedure: all'
    }
  };

  var DEFAULT_OPERATION = 'comm';

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

    root.querySelector('[data-testid="fabric-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="fabric-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="fabric-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('service-fabric-workflow');
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

  global.ServiceFabricWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
