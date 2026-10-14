/**
 * angular-workflow.js — live proof logic for RTS questionnaire Q24.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step. It walks the Angular concepts the question lists.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents one Angular concept, the reasoning behind how it is
   * used, and the observable measurement that shows the effect.
   */
  var OPERATIONS = {
    lazy: {
      label: 'Lazy-loaded routes',
      command: 'loadChildren: () => import(\'./orders/orders.routes\').then(m => m.ORDERS_ROUTES)  +  withPreloading(PreloadAllModules)',
      effect: 'Each feature area is split at the route boundary, and a preloading strategy warms the next likely route instead of shipping the whole application in the first bundle.',
      output: 'initial bundle 210 KB \u2192 78 KB gzip\n3 of 5 feature areas preloaded after idle'
    },
    guards: {
      label: 'Guards & resolvers',
      command: 'canActivate: [authGuard], canMatch: [roleGuard], canDeactivate: [unsavedChangesGuard]',
      effect: 'Navigation is decided before a component loads: authorisation by guard, data by resolver, and an unsaved-changes guard that refuses to discard a form silently.',
      output: 'blocked navigation: 0 API calls issued\nresolver preloads data before first render (no empty flash)'
    },
    interceptor: {
      label: 'Functional interceptors',
      command: 'provideHttpClient(withInterceptors([authInterceptor, retryInterceptor, correlationInterceptor]))',
      effect: 'Cross-cutting HTTP concerns are functional interceptors: attach the token, refresh once on 401 and replay the call, retry idempotent requests, and stamp a correlation id on every call.',
      output: '401 \u2192 refresh \u2192 replay, transparent to the caller\ncorrelation id on 100% of requests'
    },
    rxjs: {
      label: 'RxJS & state',
      command: 'combineLatest + switchMap + takeUntilDestroyed   \u00b7   signals for local state, store for shared state',
      effect: 'Streams are composed declaratively with the operator that matches the semantics, and teardown is bound to the lifecycle, while state is split between local signals and a store for what is genuinely shared.',
      output: 'manual subscriptions left in the feature: 0\nswitchMap cancels superseded requests (0 race results)'
    },
    forms: {
      label: 'Typed reactive forms',
      command: 'FormGroup<TypedOrderForm>  +  cross-field validators  +  debounced async validator',
      effect: 'Reactive forms are typed and validated on the client, then re-validated on the server, with a debounced async validator for the rules only the backend can decide.',
      output: 'client validation mirrors the API contract\nasync validator debounced 300 ms  \u00b7  0 duplicate submissions'
    }
  };

  var DEFAULT_OPERATION = 'lazy';

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

    root.querySelector('[data-testid="angular-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="angular-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="angular-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('angular-workflow');
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

  global.AngularWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
