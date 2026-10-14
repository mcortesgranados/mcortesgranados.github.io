/**
 * di-workflow.js — live proof logic for RTS questionnaire Q07.
 *
 * Same pattern as orm-workflow.js (Q06) and cache-workflow.js (Q05): the Angular
 * reference component basic-004/cli-workflow.ts used `signal` + `computed` +
 * `[class.active]` + `(click)`; this is the plain-DOM port, so the workflow runs
 * from a static page with no build step.
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
   * Each operation documents the registration or resolution step, the reasoning
   * behind it, and the observable result the host produces.
   */
  var OPERATIONS = {
    register: {
      label: 'Register services',
      command: 'services.AddScoped<IOrderService, OrderService>();',
      effect: 'Maps an abstraction to an implementation with an explicit lifetime, so callers depend on the interface and never construct their collaborators.',
      output: '3 registrations  \u00b7  scope: per request\nvalidateOnBuild: true  \u00b7  validateScopes: true'
    },
    lifetime: {
      label: 'Choose lifetimes',
      command: 'AddSingleton  /  AddScoped  /  AddTransient',
      effect: 'Lifetime decides instance reuse: one per application, one per request scope, or one per resolve. The wrong choice is what creates a captive dependency.',
      output: 'Singleton  \u2192  1 instance per application\nScoped     \u2192  1 per request (2 requests = 2 instances)\nTransient  \u2192  1 per resolve'
    },
    resolve: {
      label: 'Resolve the graph',
      command: 'public OrderService(IOrderRepository repository, ILogger<OrderService> logger, TimeProvider clock)',
      effect: 'Constructor injection: the container builds the graph and hands over the dependencies, so the class declares what it needs instead of reaching for a service locator.',
      output: 'graph resolved  \u00b7  4 dependencies  \u00b7  12 ms\nno service locator  \u00b7  no static state'
    },
    decorator: {
      label: 'Decorate (cross-cutting)',
      command: 'services.Decorate<IOrderService, CachedOrderService>();',
      effect: 'Registers a decorator around the interface, so caching, logging, retries or transactions are added without editing the class that owns the business logic.',
      output: 'client \u2192 CachedOrderService \u2192 OrderService\n1 cache hit  \u00b7  0 changes to OrderService'
    },
    validate: {
      label: 'Validate at startup',
      command: 'services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true, ValidateScopes = true });',
      effect: 'Validates the whole registration graph at start-up, so a captive dependency (a singleton holding a scoped service) fails immediately instead of surfacing in production.',
      output: 'FAIL FAST: cannot consume scoped IOrderContext from singleton IOrderCache\nregistration rejected before the first request'
    }
  };

  var DEFAULT_OPERATION = 'register';

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

    root.querySelector('[data-testid="di-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="di-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="di-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('di-workflow');
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

  global.DiWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
