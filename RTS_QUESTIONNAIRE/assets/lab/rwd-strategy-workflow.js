/**
 * rwd-strategy-workflow.js — live proof logic for RTS questionnaire Q23.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 *
 * Q22 covers what each viewport needs. This page covers the approach: how the
 * three concerns — layout, behaviour and per-viewport performance — are kept
 * apart so a change in one does not fight the other two.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents one decision of the approach, the reasoning behind
   * it, and the observable measurement that shows it works.
   */
  var OPERATIONS = {
    mobileFirst: {
      label: 'Mobile-first base',
      command: '@include from(\'tablet\') { \u2026 }   \u2014 the base layer is the smallest layout',
      effect: 'The smallest layout is the default and complexity is added upwards, so the constrained case is the one that cannot be forgotten and fewer properties get overridden.',
      output: 'media-query overrides per component: 6 \u2192 2\n320 px renders fully with no media query at all'
    },
    fluid: {
      label: 'Fluid before discrete',
      command: 'clamp() + minmax(0, 1fr) + space tokens   instead of   fixed widths',
      effect: 'Layout adapts continuously wherever it can and only steps discretely where behaviour genuinely must change, which removes most breakpoints from the codebase.',
      output: 'breakpoints per page: 9 \u2192 3\nfixed-width containers remaining: 0'
    },
    container: {
      label: 'Container queries',
      command: 'container-type: inline-size   +   @container (min-width: 480px)',
      effect: 'A component adapts to the space it is given rather than to the window, so the same card is correct in a sidebar, a modal and a full-width panel without variants.',
      output: '6 components self-adapting  \u00b7  0 width props passed down\none card reused in sidebar and panel'
    },
    logic: {
      label: 'Behaviour, not only styling',
      command: 'BreakpointObserver / matchMedia \u2192 signals: nav pattern, table vs cards, virtual scroll, chart detail',
      effect: 'Some differences cannot live in CSS: navigation pattern, table versus card rendering, virtual scrolling and chart density are driven by the observed viewport and the input type.',
      output: 'viewport observed once, debounced\nchart series 8 \u2192 4 below 600 px'
    },
    assetsA11y: {
      label: 'Assets & accessibility per viewport',
      command: 'srcset/sizes + art direction  \u00b7  44 px targets  \u00b7  200% zoom  \u00b7  identical accessibility tree',
      effect: 'Images are served at the size the viewport needs, and accessibility is verified at each breakpoint: targets, focus order, zoom support and an accessibility tree that does not change shape.',
      output: 'image payload 480 KB \u2192 96 KB on mobile\nWCAG 2.2 AA checks pass on all 12 viewports'
    }
  };

  var DEFAULT_OPERATION = 'mobileFirst';

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

    root.querySelector('[data-testid="rwd-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="rwd-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="rwd-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('rwd-strategy-workflow');
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

  global.RwdStrategyWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
