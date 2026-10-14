/**
 * layered-dotnet-workflow.js — live proof logic for RTS questionnaire Q26.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents one layer or boundary rule, the reasoning behind it,
   * and the evidence that the boundary is actually respected.
   */
  var OPERATIONS = {
    layers: {
      label: 'The four layers',
      command: 'Api  \u2192  Application  \u2192  Domain   \u2190   Infrastructure   (dependencies point inward)',
      effect: 'Four layers with a single dependency direction: the domain knows nothing about EF Core or HTTP, and infrastructure implements the interfaces the inner layers declare.',
      output: 'package references inside the domain project: 0\narchitecture test violations: 0'
    },
    domain: {
      label: 'Domain invariants',
      command: 'Order.Confirm() {  if (Lines.Count == 0) throw new DomainException(\u2026);  \u2026 }',
      effect: 'Business rules live once, inside the domain, as invariants that cannot be bypassed — instead of being scattered across controllers, services and stored procedures.',
      output: 'invalid state unreachable through the public API\ndomain tests 214, no mocks required'
    },
    application: {
      label: 'Application use cases',
      command: 'ConfirmOrderHandler : IRequestHandler<ConfirmOrder, Result>   \u2192   IOrderRepository, IUnitOfWork (ports)',
      effect: 'The use case orchestrates the work and depends only on interfaces it owns, so the database, the message bus or the clock can be replaced without editing the use case.',
      output: 'ports declared by the inner layer: 3\nswapped in tests: in-memory repository + fake clock'
    },
    infrastructure: {
      label: 'Infrastructure adapters',
      command: 'EfOrderRepository : IOrderRepository   +   services.AddScoped<IOrderRepository, EfOrderRepository>()',
      effect: 'Infrastructure implements the ports (repositories, gateways, clocks) and the composition root is the only place in the solution that names a concrete type.',
      output: 'EF Core types referenced outside Infrastructure: 0\none composition root per host (api, worker)'
    },
    enforce: {
      label: 'Enforce the boundaries',
      command: 'architecture tests (NetArchTest) + boundary contracts + review checklist',
      effect: 'The architecture is enforced by tests rather than by convention: an inner layer referencing an outer one, or an entity leaking into the public API contract, fails the build.',
      output: 'architecture tests 18  \u00b7  0 violations\nentities serialised at the boundary: 0 (DTOs only)'
    }
  };

  var DEFAULT_OPERATION = 'layers';

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

    root.querySelector('[data-testid="layers-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="layers-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="layers-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('layered-workflow');
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

  global.LayeredWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
