/**
 * cloud-workflow.js — live proof logic for RTS questionnaire Q12.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the platform decision, the reasoning behind it, and
   * the observable result the environment reports.
   */
  var OPERATIONS = {
    iac: {
      label: 'Infrastructure as code',
      command: 'cdk deploy  /  terraform apply   \u2014 same stack for dev, staging and prod',
      effect: 'Environments are declared as code, so a change is reviewed in a pull request, reproducible in another account, and never an undocumented console edit.',
      output: 'stack v42 deployed to dev + prod\nmanual changes pending: 0  \u00b7  drift detected: none'
    },
    compute: {
      label: 'Choose the runtime',
      command: 'Lambda (event)  \u00b7  ECS Fargate (steady)  \u00b7  App Service / Container Apps  \u00b7  Cloud Run',
      effect: 'The runtime follows the workload: functions for event-shaped work, containers for steady services, and managed data services instead of self-hosted databases.',
      output: 'api \u2192 ECS Fargate, 2 tasks  \u00b7  worker \u2192 Lambda, 1.2M invocations/month\ncold start p95 410 ms (provisioned concurrency where it matters)'
    },
    pipeline: {
      label: 'Identity in CI/CD',
      command: 'OIDC federation \u2192 short-lived role   (no long-lived access keys)',
      effect: 'The pipeline assumes a role through OIDC, so no static cloud credential exists in the repository or in the CI variables.',
      output: 'role session 15 min  \u00b7  least-privilege policy per environment\naccess keys stored in CI: 0'
    },
    observability: {
      label: 'Observability & alarms',
      command: 'CloudWatch / Application Insights / Cloud Monitoring + OpenTelemetry traces + SLO alarms',
      effect: 'Observability ships with the deployable unit: dashboards, structured logs, distributed traces and alarms wired to an SLO, not added after an incident.',
      output: 'p95 180 ms  \u00b7  error rate 0.2% (SLO 0.5%)\nalarm on breach \u2192 automatic rollback'
    },
    scale: {
      label: 'Scale & cost',
      command: 'auto scaling 2 \u2192 10 tasks   \u00b7   right-sizing + budget alarm',
      effect: 'The scaling policy and the budget are set together, so growth is automatic and its cost is visible before the invoice arrives.',
      output: 'peak 8 tasks  \u00b7  scale-out in 45 s\nrun-rate 412 USD/month  \u00b7  budget alarm at 500 USD'
    }
  };

  var DEFAULT_OPERATION = 'iac';

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

    root.querySelector('[data-testid="cloud-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="cloud-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="cloud-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('cloud-workflow');
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

  global.CloudWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
