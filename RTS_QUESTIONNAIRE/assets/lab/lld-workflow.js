/**
 * lld-workflow.js — live proof logic for RTS questionnaire Q42.
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
   * The five parts of a low-level design, which are the five bullets of the answer:
   * classes, behaviour, data, contracts, and the deliverables that let other people
   * review and then build against the design.
   */
  var OPERATIONS = {
    classdesign: {
      label: 'Class and component design',
      command: 'one responsibility per class  \u00b7  ports and dependency direction  \u00b7  ubiquitous-language naming  \u00b7  patterns applied where they resolve a named force',
      effect: 'Each class gets a responsibility that can be stated in a sentence a reviewer is able to disagree with, and the dependencies point inward through ports the calling layer owns. Patterns are applied where they resolve a named force \u2014 a strategy because the rule varies, a decorator because the behaviour is cross-cutting \u2014 rather than because a catalogue exists. When a responsibility needs the word "and" to describe it, that is the design pointing out which two classes it wants to become.',
      output: 'classes whose responsibility needs an "and" to state: 0\nports owned by the calling layer: all\npatterns applied without a named force: 0\nnames taken from the ubiquitous language rather than from the ORM: all\nports a unit test needs to stand in for: 3, with no database involved'
    },
    behaviour: {
      label: 'Behavioural design',
      command: 'a sequence diagram for the main flow and one for each error flow  \u00b7  a state machine for the lifecycle  \u00b7  the transaction boundary drawn explicitly  \u00b7  concurrency and idempotency rules',
      effect: 'Behaviour is designed before it is coded, and it is designed for the paths nobody draws: the main sequence, and then one for every way it can fail, because the error path is where the ambiguity lives. A lifecycle becomes an explicit state machine with the legal transitions named, the transaction boundary is drawn on the diagram instead of discovered in the code, and the concurrency and idempotency rules are stated in terms of what the database enforces rather than what the code hopes.',
      output: 'sequence diagrams per error path: one each, drawn before coding\nlifecycles modelled as an explicit state machine: all\nuse cases with the transaction boundary marked on the diagram: all\nillegal transitions refused in one place: the aggregate\nidempotency rule stated per operation rather than per system: all'
    },
    data: {
      label: 'Data design',
      command: 'tables and collections with their constraints  \u00b7  keys and relationships  \u00b7  the indexes the new queries will need  \u00b7  a forward-only migration strategy  \u00b7  mapping to domain and DTOs',
      effect: 'The data design is the physical shape the code inherits: tables with the constraints that enforce the rules, keys chosen for stability rather than convenience, indexes derived from the queries the feature will actually run, a migration plan that applies while the previous version is still serving traffic, and an explicit mapping between the persistence model, the domain object and the wire DTO so nobody conflates the three.',
      output: 'invariants enforced by the schema rather than by code: all\nindexes added with the query they serve named: all\nmigrations that can run while the old version is live: all\nthree models kept distinct (persistence, domain, DTO): yes'
    },
    contracts: {
      label: 'Contract design',
      command: 'endpoint by endpoint: verb, payload, status codes, validation and pagination  \u00b7  event schemas  \u00b7  external integration details',
      effect: 'Every endpoint is designed before it is written, including the parts that are easy to leave to implementation: which status code each failure returns, which validation rules belong at the edge and which belong to the domain, and how pagination behaves at the first and last page. Events are designed as versioned schemas, and every external integration is documented with its failure modes, its timeout and what the user sees when it is unavailable.',
      output: 'endpoints with every failure status decided in the design: all\nvalidation rules assigned to a layer before coding begins: all\nevents with a published schema and a version: all\nexternal integrations with a documented failure mode and timeout: all'
    },
    review: {
      label: 'Deliverables and review',
      command: 'the LLD document and its diagrams  \u00b7  pseudocode for the algorithms that are hard to get right  \u00b7  testability notes  \u00b7  a design review before coding  \u00b7  evolution in pull requests',
      effect: 'The deliverable is a document a reviewer can disagree with: the decisions taken, the alternatives rejected, the open questions with an owner, and the testability notes saying how each part will be tested before the test exists. The review happens before coding, so the cost of a wrong decision is a conversation rather than a rewrite, and the design then evolves where the code does \u2014 in pull requests \u2014 instead of stopping at the first commit.',
      output: 'features whose design was reviewed before implementation: all\nopen questions listed with an owner and a date: yes\npseudocode written for the algorithms that are hard to get right: all\ntestability notes per component: all\ndecisions traceable from the code: via the LLD record and the ADR'
    }
  };

  var DEFAULT_OPERATION = 'classdesign';

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

    root.querySelector('[data-testid="lld-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="lld-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="lld-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('lld-workflow');
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

  global.LldWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
