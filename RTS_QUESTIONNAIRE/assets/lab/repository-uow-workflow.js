/**
 * repository-uow-workflow.js — live proof logic for RTS questionnaire Q32.
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
   * Each operation documents one aspect of the two patterns: the repository
   * contract, the transactional boundary, how they compose with CQRS, the
   * specification pattern and decorators, the pragmatism rules, and how the
   * transaction itself is tested.
   */
  var OPERATIONS = {
    repository: {
      label: 'Repository',
      command: 'ICustomerRepository  \u2192  GetActiveByPlanAsync(plan, ct)   \u00b7   matching(ISpecification<Customer>)',
      effect: 'The interface belongs to the domain and expresses intent, so the caller names the question it is asking instead of assembling a query object. The implementation lives in infrastructure, where EF Core, Dapper, Spring Data or SQLAlchemy can be swapped without the domain noticing.',
      output: 'query objects reaching the domain layer: 0\nrepository implementations per stack: 3 (EF Core, Spring Data JPA, SQLAlchemy)\npublic surface: intent-named methods + specifications, no IQueryable'
    },
    uow: {
      label: 'Unit of Work',
      command: 'ConfirmOrderHandler \u2192 unitOfWork.SaveChangesAsync(ct)   \u00b7   @Transactional   \u00b7   with unit_of_work(session):',
      effect: 'One transactional boundary per use case. The aggregate is loaded, changed and committed once; the outbox row is written inside the same transaction so an event is never published for a change that rolled back, and a failure leaves nothing half-written.',
      output: 'commits per use case: 1\noutbox row written inside the transaction: yes\ndomain events dispatched before the commit: 0'
    },
    composition: {
      label: 'Composition with other patterns',
      command: 'CQRS write/read split  \u00b7  ISpecification<Customer>  \u00b7  CachingRepositoryDecorator  \u00b7  events after commit',
      effect: 'The write side uses repositories and the unit of work; the read side goes through lean query handlers that project straight to DTOs. Reusable predicates become specifications, cross-cutting behaviour wraps the repository as a decorator, and domain events are raised inside the transaction but dispatched only after it commits.',
      output: 'reporting queries forced through the domain model: 0\npredicates duplicated across handlers: 0 (specifications are shared)\ncross-cutting code inside repository implementations: 0 (decorators instead)'
    },
    pragmatism: {
      label: 'Where the patterns stop',
      command: 'refuse: generic IRepository<T> CRUD for every entity  \u00b7  repository-over-repository  \u00b7  an abstraction over an abstraction',
      effect: 'A repository that merely re-exposes Add/Update/Delete for every entity adds a layer and no meaning. I keep the pattern where it earns its place, let the read model use lean query paths, and I do not wrap an ORM that is already an abstraction when the wrapper only forwards calls.',
      output: 'generic CRUD repositories in the codebase: 0\nlayers between the handler and the database: 2 (repository, unit of work)\nread path for the reporting screen: Dapper/SQL projection, not the domain model'
    },
    testing: {
      label: 'Testing the transaction',
      command: 'SQLite in-memory for handler tests  \u00b7  Testcontainers for rollback, concurrency and constraint behaviour',
      effect: 'The fast suite runs handlers against an in-memory provider or SQLite, which is enough to assert the orchestration. The behaviour that only a real engine exhibits \u2014 rollback, unique-constraint races, optimistic concurrency, the outbox row surviving a retry \u2014 is asserted against a containerised database.',
      output: 'handler tests on an in-memory or SQLite provider: 186\nrollback and concurrency tests against a container: 24\nconstraint behaviour asserted against the real engine: yes'
    }
  };

  var DEFAULT_OPERATION = 'repository';

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

    root.querySelector('[data-testid="repo-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="repo-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="repo-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('repository-uow-workflow');
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

  global.RepositoryUowWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
