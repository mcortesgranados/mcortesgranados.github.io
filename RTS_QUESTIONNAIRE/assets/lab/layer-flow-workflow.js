/**
 * layer-flow-workflow.js — live proof logic for RTS questionnaire Q27.
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
   * Each operation documents one layer, one request travelling through all of
   * them, or the same layering expressed in the three stacks I use. Every entry
   * carries the evidence that the separation actually holds.
   */
  var OPERATIONS = {
    catalog: {
      label: 'The four layers',
      command: 'API/Presentation  \u2192  Application/Business  \u2192  Domain  \u2190  Infrastructure/Data Access',
      effect: 'The four layers in the order a request travels: transport at the edge, use cases in the middle, business rules at the core and the adapters that touch the outside world. Each responsibility belongs to exactly one layer.',
      output: 'layers: 4\nresponsibilities owned by exactly one layer: 4\nlayers that may be skipped: 0'
    },
    request: {
      label: 'Trace one request',
      command: 'POST /orders/7f3c19e2/confirm  \u2192  Api  \u2192  Application  \u2192  Domain  \u2192  Infrastructure  \u2192  204 No Content',
      effect: 'One request traced end to end: the endpoint validates and translates HTTP, the use case orchestrates, the aggregate enforces the rule and the repository persists. Each layer is entered once and returns inward outwards.',
      output: 'layers entered: 4\nbusiness rules evaluated outside Domain: 0\nSQL emitted by Api or Application: 0'
    },
    api: {
      label: 'API / Presentation',
      command: '[HttpPost("orders/{id:guid}/confirm")] ConfirmOrderRequest \u2192 ConfirmOrderCommand \u2192 OrderResponse',
      effect: 'Presentation only translates: model binding, request validation, authentication, RFC 7807 problem details, OpenAPI and rate limiting. It maps the DTO to a command and delegates — it never makes a business decision.',
      output: 'database calls from the Api layer: 0\nentities serialised at the boundary: 0 (DTOs only)\nproblem details on failure: 1'
    },
    data: {
      label: 'Infrastructure / Data Access',
      command: 'EfOrderRepository : IOrderRepository   \u00b7   OrderJpaRepository   \u00b7   SqlAlchemyOrderRepository',
      effect: 'Every stack hides data access behind an interface the inner layers declare: EF Core, Spring Data JPA or SQLAlchemy can be replaced, and a migration can be regenerated, without editing a single business rule.',
      output: 'ORM types referenced outside the data layer: 0\nmigrations owned by the data layer: 1 set\nexternal calls (HTTP, bus, storage) issued here: all'
    },
    mapping: {
      label: 'Same layers, three stacks',
      command: '@RestController / Service / Entity+Domain / Repository   \u00b7   Controller / Handler / Aggregate / Repository   \u00b7   APIRouter / Service / Model / Repository',
      effect: 'The four layers are a pattern rather than a .NET feature. Spring Boot (Controller, Service, Entity, Repository), .NET (Controller, Handler, Aggregate, Repository) and FastAPI (Router, Service, Domain model, Repository) express the same separation with different names.',
      output: 'stacks implementing the same layering: 3\ndependencies pointing inward in all three: yes\nbusiness rules duplicated per stack: 0 (one model per system)'
    }
  };

  var DEFAULT_OPERATION = 'catalog';

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

    root.querySelector('[data-testid="layerflow-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="layerflow-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="layerflow-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('layer-flow');
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

  global.LayerFlowWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
