/**
 * spa-workflow.js — live proof logic for RTS questionnaire Q19.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step. React, Next.js and Vue all express the same three ideas —
 * state, derivation and rendering — so the comparison is about trade-offs.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the framework decision, the reasoning behind it,
   * and the observable measurement that proves it.
   */
  var OPERATIONS = {
    react: {
      label: 'React 19 + hooks',
      command: 'const { data, error, isLoading } = useOrders(customerId);   // hooks, suspense-ready',
      effect: 'React for component-driven interfaces: hooks with explicit dependencies, derived state instead of duplicated state, and error boundaries around the risky subtrees.',
      output: 're-renders 4 \u2192 2 after memoising the selector\nroute-level chunk 48 KB'
    },
    nextjs: {
      label: 'Next.js rendering modes',
      command: 'export const revalidate = 60;   // ISR: static speed with periodic freshness',
      effect: 'The rendering strategy follows the data: static where it can be, server-rendered where it must be, and client-side only for what is genuinely interactive.',
      output: 'LCP 1.2 s (SSG/ISR) vs 2.9 s (CSR baseline)\nCLS 0.01  \u00b7  hydration-safe'
    },
    vue: {
      label: 'Vue 3 composition API',
      command: 'const state = reactive({ orders: [] }); const total = computed(() => \u2026)',
      effect: 'Vue for teams that prefer the template model: reactive state, cached computed derivations and single-file components, held to the same testing and accessibility standard.',
      output: 'computed recalculates only when its dependency changes\ncoverage parity with the Angular and React apps'
    },
    mobile: {
      label: 'React Native reuse',
      command: 'React Native + a shared domain package (types, validation, API client)',
      effect: 'Mobile reuses the domain layer from the web app, so validation and behaviour cannot drift between platforms, while platform specifics stay behind one adapter.',
      output: '3,100 lines of domain code reused\nplatform code isolated behind a single adapter'
    },
    quality: {
      label: 'Cross-framework quality bar',
      command: 'Testing Library  \u00b7  axe accessibility checks  \u00b7  bundle budgets  \u00b7  Core Web Vitals in CI',
      effect: 'The quality bar belongs to the team, not to the framework: the same accessibility checks, testing approach and performance budgets run whatever the renderer is.',
      output: 'a11y violations 0  \u00b7  budgets enforced in the pipeline\nCore Web Vitals tracked per release'
    }
  };

  var DEFAULT_OPERATION = 'react';

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

    root.querySelector('[data-testid="spa-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="spa-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="spa-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('spa-workflow');
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

  global.SpaWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
