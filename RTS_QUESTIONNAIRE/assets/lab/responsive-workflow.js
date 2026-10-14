/**
 * responsive-workflow.js — live proof logic for RTS questionnaire Q22.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents what one viewport class actually requires, the
   * reasoning behind it, and the measurement taken at that size.
   */
  var OPERATIONS = {
    mobile: {
      label: 'Mobile 360-480',
      command: '@media (max-width: 600px) { 1 column \u00b7 44 px tap targets \u00b7 base 16 px }',
      effect: 'Phone first: one column, tap targets of at least 44&times;44 px, no hover-only affordance, and no horizontal scroll even at 320 px.',
      output: '375\u00d7812  \u00b7  scrollWidth 375 (no overflow)\ntap target 44 px  \u00b7  base font 16 px'
    },
    tablet: {
      label: 'Tablet 601-1024',
      command: '@media (601px <= width <= 1024px) { grid-template-columns: repeat(2, 1fr) }',
      effect: 'Tablet gets two columns and a persistent side navigation from the same components, not a second layout maintained in parallel.',
      output: '834\u00d71112  \u00b7  2 columns  \u00b7  navigation persistent\ntouch and pointer input both supported'
    },
    laptop: {
      label: 'Laptop 1025-1599',
      command: '@media (min-width: 1025px) { .shell { grid-template-columns: 240px 1fr } }',
      effect: 'Laptop gets the full shell: side navigation, tables that can use their real columns, and denser information where the screen affords it.',
      output: '1440\u00d7900  \u00b7  3 columns  \u00b7  tables show 8 columns\ndensity mode enabled'
    },
    desktop: {
      label: 'Desktop 1600+',
      command: '@media (min-width: 1600px) { max-inline-size: 1600px; margin-inline: auto }  +  container queries',
      effect: 'On wide screens the content is capped instead of stretched, and container queries let a component adapt to its own slot rather than to the global viewport.',
      output: '2560\u00d71440  \u00b7  content capped at 1600 px\ncontainer queries: 6 components'
    },
    verification: {
      label: 'Verification matrix',
      command: 'Playwright viewport matrix  +  axe  +  Lighthouse budgets  +  real devices',
      effect: 'Responsive behaviour is verified rather than eyeballed: the same scenarios run across a viewport matrix in CI, with accessibility and performance budgets attached.',
      output: '12 viewports \u00d7 9 scenarios = 108 checks, 0 failures\nLighthouse mobile 94  \u00b7  CLS 0.01'
    }
  };

  var DEFAULT_OPERATION = 'mobile';

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

    root.querySelector('[data-testid="responsive-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="responsive-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="responsive-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('responsive-workflow');
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

  global.ResponsiveWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
