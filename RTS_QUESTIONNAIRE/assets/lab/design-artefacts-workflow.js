/**
 * design-artefacts-workflow.js — live proof logic for RTS questionnaire Q43.
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
   * The five artefact types the question names, one operation each, and for each one the
   * same three questions: what it contains, who reads it, and how it is kept from going
   * stale.
   */
  var OPERATIONS = {
    er: {
      label: 'ER diagrams',
      command: 'entities, attributes and cardinality  \u00b7  generated from the migrations rather than drawn  \u00b7  a conceptual view for the business and a physical one for the team',
      effect: 'The ER diagram is a view of the schema rather than a separate document: it is generated from the migrations, so it cannot show a table that no longer exists or miss one that was added on a Friday afternoon. There are two levels because there are two audiences \u2014 the conceptual model the business can read, and the physical one with types and keys that the team reviews the change against.',
      output: 'hand-drawn ER diagrams that can go stale: 0\nthe physical diagram generated from the migrations: on every release\nconceptual models reviewed with the business owner: yes\nan entity in a diagram with no table behind it: 0'
    },
    schema: {
      label: 'Database schemas',
      command: 'DDL under version control  \u00b7  forward-only migrations  \u00b7  the data dictionary generated from the DDL  \u00b7  one ER view per bounded context',
      effect: 'The schema document is the DDL itself, reviewed in a pull request like any other change, and the documentation is generated from it rather than maintained beside it. Migrations are forward-only and versioned, and each bounded context keeps its own ER view so a reader sees one domain instead of the whole warehouse.',
      output: 'schemas defined outside version control: 0\nschema documentation written by hand: 0 pages, all generated\nmigrations forward-only and reviewed in a pull request: all\ndictionary coverage of columns: 100%, with the comment text taken from the DDL'
    },
    contracts: {
      label: 'API contracts',
      command: 'OpenAPI generated from the implementation or asserted against it  \u00b7  event schemas in a registry with a compatibility mode  \u00b7  a diff against the published version in CI',
      effect: 'A contract is a machine-readable document with a generator on one side and a validator on the other, which is what separates it from a specification living in a wiki. The OpenAPI document either comes from the implementation or is written first and asserted against it; event schemas live in a registry with a compatibility mode; and a diff against the published version runs in CI so that a breaking change requires a new major version rather than an apology.',
      output: 'contracts maintained as a hand-written wiki page: 0\ncontracts generated from or validated against the implementation: all\nbreaking-change diff run in CI: on every change to a published contract\nevent schemas under a registry with a compatibility mode: all'
    },
    architecture: {
      label: 'Component and service architecture',
      command: 'C4 levels  \u00b7  the container and component views generated from the deployment manifests and the service catalogue  \u00b7  dependencies and data ownership recorded as data, not drawn as arrows',
      effect: 'Architecture diagrams follow the C4 levels so each one answers a different question rather than trying to answer all of them at once, and the container and component views are generated from the deployment manifests and the service catalogue, where that truth already lives. Ownership, dependencies and data ownership are recorded as data instead of drawn as arrows, so a review can ask whether a dependency is permitted instead of squinting at a picture.',
      output: 'diagrams drawn by hand and never regenerated: 0\ncontainer and component views generated from the manifests: all\nservices missing an owner in the catalogue: 0\ndependency arrows that contradict the catalogue: 0'
    },
    workflows: {
      label: 'Business workflows',
      command: 'the process as a model: BPMN or a flow and state definition  \u00b7  built with the process owner  \u00b7  the exception and escalation paths included  \u00b7  versioned with the release that changes the process',
      effect: 'A business workflow is a model the process owner can read and correct, so it is built with them rather than presented to them, and the exception paths are included because the exceptions are where the process actually lives. It is versioned and reviewed whenever the process changes, and it is the artefact that turns "the system should do X" into a shared understanding of which steps are automated and which are still people.',
      output: 'workflows documented only in a developer diagram: 0\nprocess owners who have corrected a workflow model: all of them\nexception and escalation paths modelled: yes\nworkflow versions tied to the release that changed the process: all'
    }
  };

  var DEFAULT_OPERATION = 'er';

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

    root.querySelector('[data-testid="docs-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="docs-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="docs-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('design-artefacts-workflow');
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

  global.DesignArtefactsWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
