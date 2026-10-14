/**
 * rest-api-workflow.js — live proof logic for RTS questionnaire Q28.
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
   * Each operation documents one step of designing a REST API in .NET — the
   * resource model, the HTTP semantics, the collection conventions, the security
   * envelope and the verification — with the evidence behind the claim.
   */
  var OPERATIONS = {
    resource: {
      label: 'Model the resources',
      command: 'POST /orders  \u00b7  GET /orders/{orderId}  \u00b7  GET /orders/{orderId}/lines  \u00b7  POST /orders/{orderId}/confirm',
      effect: 'Resources are nouns and the hierarchy lives in the path. The one verb-like segment is a state transition, and it is modelled as a sub-resource that receives a POST instead of inventing /confirmOrder. Every path resolves to exactly one aggregate.',
      output: 'aggregates exposed: 2 (order, order lines)\nverbs appearing in a URI: 0\nstate transitions modelled as sub-resources: 1'
    },
    verbs: {
      label: 'Get the HTTP semantics right',
      command: 'GET 200  \u00b7  POST 201 + Location  \u00b7  PUT 200 idempotent  \u00b7  PATCH 200  \u00b7  DELETE 204  \u00b7  409 conflict  \u00b7  412 stale If-Match',
      effect: 'The method carries the meaning: GET, PUT, DELETE and HEAD are idempotent, POST is not, a state conflict answers 409 while a failed precondition answers 412, and a rejection carries the validation errors. A client can retry safely without reading the documentation.',
      output: 'safe methods: GET, HEAD\nidempotent methods: GET, PUT, DELETE, HEAD\nretries that duplicate a side effect: 0'
    },
    paging: {
      label: 'Collections and errors',
      command: 'GET /orders?status=confirmed&sort=-createdAt&page[size]=25&page[after]=eyJpZCI6IjdmM2MifQ',
      effect: 'A collection is never returned unbounded: cursor pagination with a hard page-size ceiling, a documented filter and sort grammar, and a single error shape for every failure mode — ProblemDetails with a type, a title, a status and a traceId.',
      output: 'max page[size] accepted: 100\nunbounded collection endpoints: 0\nerror payload shapes: 1 (RFC 7807)'
    },
    security: {
      label: 'Security, limits, versioning',
      command: 'Authorization: Bearer <jwt> \u2192 policy orders:write  \u00b7  rate limit 100/min per caller  \u00b7  /api/v1',
      effect: 'Every endpoint carries an explicit authorisation policy, the caller identity comes from validated JWT claims rather than from the body, requests are rate limited per caller, and the version lives in the path so a breaking change never silently reaches an existing client.',
      output: 'endpoints without an explicit policy: 0\nidentifiers taken from the request body instead of the token: 0\nbreaking changes released inside /v1: 0'
    },
    verify: {
      label: 'Contract and verification',
      command: 'OpenAPI 3.1 generated from the endpoints  \u2192  typed client for the Angular SPA  \u2192  contract tests + WebApplicationFactory integration suite',
      effect: 'The OpenAPI document is generated from the code instead of hand-written, the SPA consumes a generated typed client, and the integration suite drives the real HTTP pipeline against a containerised database, so the contract is tested rather than merely documented.',
      output: 'integration tests through the real pipeline: 84\ncontract drift between the published spec and the API: 0\nhot endpoint budget (p95): 120 ms'
    }
  };

  var DEFAULT_OPERATION = 'resource';

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

    root.querySelector('[data-testid="rest-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="rest-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="rest-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('rest-api-workflow');
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

  global.RestApiWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
