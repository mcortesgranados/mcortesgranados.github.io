/**
 * mfe-workflow.js — live proof logic for RTS questionnaire Q29.
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
   * Each operation documents one micro-frontend strategy, or the governance and
   * the counter-argument that decide whether the split is worth it at all.
   */
  var OPERATIONS = {
    federation: {
      label: 'Module Federation',
      command: 'ModuleFederationPlugin \u2192 remotes: { search, analytics, admin }  \u00b7  shared: { @angular/core, rxjs, design-system } (singleton, strictVersion)',
      effect: 'A host shell loads independently deployed remotes at runtime. Framework libraries and the design system are shared singletons with strict version negotiation, so Angular, RxJS and the token stylesheet are instantiated once even with three remotes on the page.',
      output: 'remotes loaded at runtime: 3\ncopies of @angular/core on the page: 1\nversion mismatch: fails the build, not the user session'
    },
    elements: {
      label: 'Web Components / Angular Elements',
      command: 'createCustomElement(OrderCardComponent, { injector })  \u2192  customElements.define("acme-order-card", element)',
      effect: 'A widget packaged as a framework-agnostic custom element can be mounted by a legacy page or by another framework, which is how a screen is modernised incrementally instead of rewritten. Attributes in, custom events out, shadow DOM for style isolation.',
      output: 'hosts that mount the same element: 3 (legacy MVC page, React, Angular)\ncross-framework style leaks: 0 (shadow DOM)\npublic contract: attributes in, CustomEvent out'
    },
    orchestration: {
      label: 'Route-based orchestration',
      command: 'registerApplication({ name: "search", activeWhen: "/search", app: () => import("search/App") })',
      effect: 'Each vertical is owned by one team, mounted under its own route and downloaded only when that route becomes active. The shell keeps what must stay common: authentication and token refresh, navigation, theming, error boundaries and analytics.',
      output: 'verticals with a single owning team: 3\nremotes downloaded for an inactive route: 0\nshared shell responsibilities: auth, nav, theme, error boundary, analytics'
    },
    governance: {
      label: 'Governance that makes it work',
      command: 'versioned design system  \u00b7  contract-first events  \u00b7  central token handling  \u00b7  one CI/CD pipeline per remote  \u00b7  per-remote observability',
      effect: 'Independent deployment is only real when the boundaries are governed: a versioned design system, events as the only cross-team channel, centralised token handling, a pipeline per remote, and per-remote error and performance telemetry with a named owner in CODEOWNERS.',
      output: 'pipelines that redeploy every remote together: 0\ncross-remote deep imports: 0 (declared exposed modules only)\nremotes with a named owner: 3/3'
    },
    decision: {
      label: 'When NOT to use it',
      command: 'check: team count  \u00b7  deployment independence  \u00b7  framework heterogeneity  \u2192  else modular monolith + shared component library',
      effect: 'Micro-frontends buy independent deployment at the price of duplicated runtime, version negotiation and cross-team coordination. With one or two teams, a tightly coupled domain and a single framework, a modular monolith with a shared component library delivers more value for far less operational cost.',
      output: 'teams that justify the split: 3 or more\nrecommendation for a single team: modular monolith\naccepted cost when adopted: duplicated runtime, versioning, coordination'
    }
  };

  var DEFAULT_OPERATION = 'federation';

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

    root.querySelector('[data-testid="mfe-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="mfe-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="mfe-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('mfe-workflow');
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

  global.MfeWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
