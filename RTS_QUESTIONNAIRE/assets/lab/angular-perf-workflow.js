/**
 * angular-perf-workflow.js — live proof logic for RTS questionnaire Q25.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 *
 * The order of the steps matters: measure first, then fix rendering and bundle,
 * then prove it with field data, and finally check that nothing is leaking.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents one part of the optimisation, the reasoning behind
   * it, and the measurement that justifies it.
   */
  var OPERATIONS = {
    changeDetection: {
      label: 'Change detection',
      command: 'changeDetection: OnPush  +  signals/computed  +  pure pipes  \u2014  no template function calls',
      effect: 'Change detection runs only when something actually changes: OnPush everywhere, signals for derived values, pure pipes instead of template methods, and detached detection for high-frequency widgets.',
      output: 'checks per interaction: 412 \u2192 37\ncomponents re-rendered on one row update: 2 of 40'
    },
    rendering: {
      label: 'Rendering cost',
      command: '@for (order of orders(); track order.id)  +  cdk-virtual-scroll  +  @defer (on viewport)',
      effect: 'The DOM holds only what is visible: stable tracking avoids re-creating elements, virtual scrolling keeps the node count constant for a long list, and heavy parts load only when needed.',
      output: 'DOM nodes 1,240 \u2192 42 for the same list\nchart chunk deferred until it scrolls into view'
    },
    bundle: {
      label: 'Bundle budget',
      command: 'route-level splitting + budgets in angular.json + source-map-explorer review',
      effect: 'Bundle size is a budget with a build failure attached: split per route, verify that tree-shaking worked, and replace a heavy dependency with a lighter one when the graph shows it.',
      output: 'initial 210 KB \u2192 78 KB gzip (warn 150 KB / error 200 KB)\nmoment.js replaced by Intl (+52 KB recovered)'
    },
    measurement: {
      label: 'Measure, then optimise',
      command: 'Angular DevTools profiler + PerformanceObserver for LCP, INP and CLS in production',
      effect: 'Optimisation follows evidence: the flame chart and field data show where time goes on a throttled CPU and a slow network, not on a developer laptop with a warm cache.',
      output: 'LCP 3.4 s \u2192 1.2 s under 4\u00d7 CPU throttle\nINP 340 ms \u2192 96 ms  \u00b7  CLS 0.01'
    },
    memory: {
      label: 'Leaks & teardown',
      command: 'takeUntilDestroyed / DestroyRef on subscriptions, listeners, intervals and caches',
      effect: 'A performance problem is often a leak: every subscription, DOM listener, timer and unbounded cache is released with the component, and heap snapshots confirm the effect.',
      output: 'detached DOM nodes after 20 navigations: 0\nheap drift across 20 cycles removed (\u221218 MB)'
    }
  };

  var DEFAULT_OPERATION = 'changeDetection';

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

    root.querySelector('[data-testid="perf-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="perf-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="perf-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('angular-perf-workflow');
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

  global.AngularPerfWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
