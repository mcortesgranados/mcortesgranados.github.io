/**
 * api-crosscutting-workflow.js — live proof logic for RTS questionnaire Q37.
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
   * Each operation is one of the six cross-cutting concerns the question lists, with
   * the decision stated as a rule rather than as a technology name.
   */
  var OPERATIONS = {
    versioning: {
      label: 'API versioning',
      command: '/api/v1/orders (primary)  \u00b7  api-version header (also supported)  \u00b7  no version \u2192 400  \u00b7  Sunset header on deprecated versions',
      effect: 'The version lives in the URL because it is the version clients actually pin to, with the header accepted as a second route for internal callers. A request without a version is a 400 rather than a silent default, which is what stops a new client from accidentally binding to v1 forever. Deprecation is announced with a Sunset header plus telemetry on the callers still using it, and the OpenAPI document is generated per version.',
      output: 'versions served concurrently: 2\nrequests without a version: 400, never a silent default\ncallers on the deprecated version: tracked, by client id\ndeprecation announced with a Sunset header: yes'
    },
    authz: {
      label: 'Authentication and authorization',
      command: 'JWT bearer validated against the issuer JWKS  \u00b7  a named policy per endpoint  \u00b7  scopes and claims, never the request body',
      effect: 'Authentication is a bearer token validated against the issuer metadata; authorization is a named policy resolved per endpoint, with the requirement expressed as a scope or a claim and never read from the payload. A resource belonging to another tenant answers 404 rather than 403, so the API never confirms that an identifier exists.',
      output: 'endpoints without an explicit policy: 0\nidentity read from the request payload: 0\nJWKS cached, refreshed on a kid change: yes\ntenant mismatch answered as 404 rather than 403: yes'
    },
    validation: {
      label: 'Validation',
      command: 'edge: shape and format  \u00b7  domain: invariants through the aggregate  \u00b7  database: unique constraint as the last defence',
      effect: 'Three layers with three different jobs. The edge validates the shape and format of the request and returns every failure at once. The domain validates the business rules and can only be reached through its aggregate. The database keeps the constraint that survives two concurrent requests. A rule duplicated across layers is a bug, so each rule has exactly one home and the other layers only defend.',
      output: 'validation failures returned per request: all of them, not the first one\nrules duplicated across two layers: 0\ninvariants enforced only in a controller: 0\nconstraints kept as the last line of defence: yes'
    },
    errors: {
      label: 'Exception handling',
      command: 'IExceptionHandler  \u00b7  domain failure \u2192 400/409 ProblemDetails  \u00b7  unexpected \u2192 500 with a traceId and nothing else',
      effect: 'One handler for the whole pipeline maps known failures to the right status with a machine-readable type, and turns an unexpected exception into a 500 that carries a trace id and no stack trace, no SQL text and no internal path. The correlation is what keeps that 500 debuggable without leaking anything to the caller.',
      output: 'stack traces or SQL text returned to a client: 0\nproblem-details shapes for a failure: 1\ntraceId on every error response: yes\nfull detail logged server-side: yes'
    },
    observability: {
      label: 'Logging and observability',
      command: 'structured logs inside a correlation scope  \u00b7  OpenTelemetry traces and metrics  \u00b7  PII redacted at the sink',
      effect: 'Logs are structured and carry a correlation id injected at the edge and propagated through every call and every message, so one query reconstructs a request across services. Traces carry the same id, metrics answer the rate/errors/duration questions per endpoint, personal data is redacted at the sink rather than at each call site, and health checks separate liveness from readiness.',
      output: 'log statements that concatenate a message: 0\npersonal data written to a log: 0 (redacted at the sink)\ncorrelation id on every log line: yes\nhealth endpoints: liveness without dependencies, readiness with them\nmetric set: rate, errors and duration per endpoint'
    }
  };

  var DEFAULT_OPERATION = 'versioning';

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

    root.querySelector('[data-testid="apix-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="apix-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="apix-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('api-crosscutting-workflow');
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

  global.ApiCrosscuttingWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
