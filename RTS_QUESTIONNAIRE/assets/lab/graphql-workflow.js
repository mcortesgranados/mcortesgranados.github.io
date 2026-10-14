/**
 * graphql-workflow.js — live proof logic for RTS questionnaire Q11.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the schema or execution decision, the reasoning
   * behind it, and the observable measurement that proves it.
   */
  var OPERATIONS = {
    schema: {
      label: 'Schema-first contract',
      command: 'type Order { id: ID!  lines: [OrderLine!]! }   \u00b7   query { orders(first: 20, after: $cursor) { \u2026 } }',
      effect: 'The schema is the contract: types, nullability and cursor pagination are designed before the resolvers, so a client can only ask for what the model allows.',
      output: 'SDL 412 lines  \u00b7  breaking-change check in CI\nnullable fields reviewed per query'
    },
    resolve: {
      label: 'Resolvers + DataLoader',
      command: 'orders: (_, args, ctx) => ctx.loaders.ordersByCustomer.load(args.customerId)',
      effect: 'Field resolvers batch through DataLoader, so a nested selection does not turn into one query per row — the N+1 that GraphQL is known for.',
      output: 'resolvers 37  \u00b7  DataLoader batches once per request\nDB queries per request: 4 (was 141)'
    },
    limits: {
      label: 'Depth, cost & allow-list',
      command: 'depthLimit(10) + costAnalysis(maxCost: 1000) + persisted queries only in production',
      effect: 'Depth, cost and an operation allow-list are enforced server-side, so an expensive or unexpected query is rejected before it reaches the database.',
      output: 'query depth 7 of 10  \u00b7  cost 940 of 1000\nregistry 86 operations  \u00b7  ad-hoc queries blocked in prod'
    },
    errors: {
      label: 'Errors & partial data',
      command: '{ "data": { "orders": [\u2026] }, "errors": [ { "path": ["orders", 0, "lines"], "extensions": { "code": "UPSTREAM_TIMEOUT" } } ] }',
      effect: 'Partial success is explicit: an error carries its path and a machine-readable code, so the client degrades a single field instead of failing the whole screen.',
      output: 'partial data returned  \u00b7  error path reported\ntrace id attached to every error entry'
    },
    subscriptions: {
      label: 'Subscriptions & tracing',
      command: 'subscription { orderStatusChanged(orderId: "8842") { status } }   \u00b7   per-field tracing',
      effect: 'Subscriptions push only what changed, and per-field tracing shows which resolver owns the latency, so optimisation targets the real hotspot.',
      output: 'subscription over WebSocket  \u00b7  1 event, no polling\nslowest field: lines.aggregate 82 ms'
    }
  };

  var DEFAULT_OPERATION = 'schema';

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

    root.querySelector('[data-testid="graphql-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="graphql-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="graphql-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('graphql-workflow');
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

  global.GraphqlWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
