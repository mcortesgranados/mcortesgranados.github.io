/**
 * openapi-lifecycle-workflow.js — live proof logic for RTS questionnaire Q49.
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
   * The specification lifecycle, from who writes it to what stops it from rotting:
   * authoring, the tools that consume it, the governance across services, the writing
   * itself, and the pipeline that keeps it true.
   */
  var OPERATIONS = {
    authoring: {
      label: 'Authoring the specification',
      command: 'design-first where an external consumer depends on it  \u00b7  code-first (Swashbuckle/NSwag, springdoc-openapi, FastAPI) for internal contracts  \u00b7  one source of truth per API',
      effect: 'The contract is authored design-first when a consumer outside the team depends on it, because the largest value of a specification is agreeing the shape before anything is built. It is generated code-first from the implementation where the consumers are internal and the API is still moving: Swashbuckle or NSwag in .NET, springdoc-openapi in Java, the native schema in FastAPI. What is never acceptable is both at once \u2014 a hand-written document beside a generated one \u2014 which is how a specification becomes a guess.',
      output: 'APIs with a hand-written spec beside a generated one: 0\ndesign-first where an external consumer depends on the contract: yes\ncode-first where the implementation is the source of truth: yes\nOpenAPI version in use: 3.1, with 3.0 only where a tool lags'
    },
    tooling: {
      label: 'Tooling around the document',
      command: 'Swagger UI  \u00b7  mock servers generated from the spec  \u00b7  typed clients for the SPA and for partners  \u00b7  schema validation in the pipeline',
      effect: 'The document is only worth writing if tools consume it: Swagger UI so QA and partners explore and call the API without a hand-written collection, a mock server generated from the spec so front-end work starts before the endpoint exists, typed clients generated for the SPA and for partner integrations so no DTO is maintained by hand, and schema validation in the pipeline so the document cannot quietly become invalid.',
      output: 'hand-maintained DTOs on the client: 0 (generated from the spec)\nfront-end unblocked by a mock before the endpoint exists: yes\nQA exploring the API through the UI rather than a hand-written collection: yes\ndocument validated on every pipeline run: yes'
    },
    governance: {
      label: 'Governance across services',
      command: 'versioning and deprecation expressed in the document  \u00b7  one naming and pagination convention  \u00b7  security and rate limits documented with numbers  \u00b7  an API catalogue',
      effect: 'Consistency across services is what makes an estate navigable: the versioning and deprecation policy lives in the document rather than only in a wiki, naming and pagination follow one convention so a consumer learns them once, security schemes and rate limits are documented with the actual numbers, and a catalogue lists every service and version so nobody has to ask which one to call.',
      output: 'deprecated operations carrying Sunset and a deprecation date: all\nservices deviating from the naming or pagination convention: 0\nrate limits documented with real numbers: yes\nAPI catalogue listing every service and version: yes'
    },
    style: {
      label: 'Writing for the consumer',
      command: 'descriptions that answer questions  \u00b7  a realistic example on every schema  \u00b7  business rules captured  \u00b7  every error payload enumerated',
      effect: 'The document is written for the person integrating rather than for the person who wrote the code: every parameter and field says what it means and what happens when it is wrong, examples are realistic instead of "string", the business rules a consumer would otherwise ask about are written where they will look for them, and every error status is enumerated with its payload so error handling is designed rather than discovered in production.',
      output: 'schemas carrying a realistic example: all\noperations enumerating every error status they can return: all\nrecurring support questions traced to a missing description: 0\npublished descriptions free of internal jargon: yes'
    },
    enforcement: {
      label: 'CI enforcement and drift detection',
      command: 'spectral lint against the house ruleset  \u00b7  valid OpenAPI 3.1  \u00b7  a breaking-change gate against the published version  \u00b7  contract tests',
      effect: 'A contract that is not enforced rots. The pipeline lints the document against the house ruleset, validates it against the OpenAPI dialect, diffs it against the published version so a breaking change cannot ship inside an existing major version, and runs contract tests that fail when the implementation drifts from the specification. The document is then published from the pipeline rather than uploaded by hand, so the portal can never show a version that does not exist.',
      output: 'breaking changes reaching a published major version: 0\ncontract drift between spec and implementation: 0\nlint rules enforced on every pull request: 34\nthe portal publishing a spec the pipeline has not validated: never'
    }
  };

  var DEFAULT_OPERATION = 'authoring';

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

    root.querySelector('[data-testid="oapi-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="oapi-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="oapi-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('openapi-lifecycle-workflow');
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

  global.OpenApiLifecycleWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
