/**
 * fe-arch-workflow.js — live proof logic for RTS questionnaire Q30.
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
   * Each operation documents one front-end architecture pattern as a design
   * decision: what it is made of, why it is chosen over the alternatives, and the
   * evidence that the choice was measured rather than asserted.
   */
  var OPERATIONS = {
    modular: {
      label: 'Modular monolith',
      command: 'apps/web \u2192 features/{orders, billing, search} \u2192 shared/kernel  (one deployable; boundaries enforced by lint, not by convention)',
      effect: 'One deployable Angular application split into enforced feature boundaries: each feature owns its routes, state and API access, lazy-loaded domains keep the initial bundle small, and the shared kernel holds only what every feature genuinely needs. It is my default because it delivers most of the benefit of modularity without the operational cost of separate deployments.',
      output: 'deployables: 1\ncross-feature imports allowed by the import matrix: 0\nnew developer to first shipped feature: 3 days'
    },
    micro: {
      label: 'Micro-frontends',
      command: 'shell + remotes  \u00b7  Module Federation for same-framework verticals  \u00b7  Web Components for legacy islands',
      effect: 'Reserved for the case where independent deployment or framework heterogeneity is a real requirement: a shell with independently deployed remotes, or Web Component islands used to modernise a legacy page incrementally. One source of shared design tokens, one auth path and one telemetry schema are the conditions that make it viable.',
      output: 'teams required to justify the split: 3+\nsources of truth for design tokens across remotes: 1\ntelemetry schemas across remotes: 1\n(mechanics covered in detail on the Q29 proof page)'
    },
    designsystem: {
      label: 'Shared component library',
      command: '@acme/ui-kit 4.2.0  \u2192  primitives (button, table, form, layout, chart wrappers) + documented usage rules',
      effect: 'A versioned package of UI primitives built on Material/CDK or Headless UI, with usage rules in a documentation site, visual snapshot tests in CI and semantic-versioned releases. It is the mechanism that keeps a modular monolith, a monorepo and a micro-frontend estate looking like one product.',
      output: 'applications consuming the same primitives: 4\nvisual snapshot coverage: every primitive and pattern\naccessibility checks in the component pipeline: axe + keyboard tests'
    },
    monorepo: {
      label: 'Monorepo, BFF, islands',
      command: 'nx affected --target=build  \u00b7  feature-sliced layers  \u00b7  BFF aggregation  \u00b7  islands/SSR for SEO pages',
      effect: 'An Nx-style monorepo with shared libraries and affected-only builds keeps CI proportional to the change; feature-sliced design names the layers so every import has a direction; a BFF aggregates the APIs the UI needs so the client stays simple; islands and SSR are used only where SEO or first paint genuinely demands them.',
      output: 'CI jobs run per pull request: the affected graph only\nduplicated state ownership between BFF and client: 0\npages rendered on the server because SEO required it: 6'
    },
    adr: {
      label: 'ADRs and success criteria',
      command: 'ADR-014 modular monolith  \u00b7  ADR-021 design system  \u00b7  measured: deploy independence, build time, change failure rate, time-to-first-feature',
      effect: 'Every architecture choice is recorded as an ADR \u2014 the problem, the alternatives considered, the decision, the consequences and the migration path \u2014 and the success criteria are measured rather than asserted, so the architecture can be re-evaluated with data instead of defended by seniority.',
      output: 'criteria measured rather than asserted: 4\nbuild p50 for a one-feature change: 4 min 20 s\nchange failure rate after the design system: 11% \u2192 6%\nADR scheduled for review after two quarters: yes'
    }
  };

  var DEFAULT_OPERATION = 'modular';

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

    root.querySelector('[data-testid="fea-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="fea-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="fea-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('fe-arch-workflow');
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

  global.FeArchWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
