/**
 * solid-workflow.js — live proof logic for RTS questionnaire Q33.
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
   * Each operation is one SOLID principle shown as a refactor: the design that
   * violates it, the design that satisfies it, the reasoning, and a number that
   * shows the change was real rather than cosmetic.
   */
  var OPERATIONS = {
    srp: {
      label: 'S \u2014 Single Responsibility',
      command: 'before: OrderService (pricing + tax + persistence + email + logging)  \u2192  after: OrderPricing, TaxPolicy, IOrderRepository, INotifier',
      effect: 'One reason to change per class. A service that prices an order, computes tax, writes to the database, sends the confirmation and logs is five reasons to change and five people touching one file. Splitting it gives the pricing rule one home and the persistence concern another, which is what makes either of them reviewable.',
      output: 'reasons to change in the pricing class: 1 (from 5)\nunit tests that need no database or mail server: 34\nclasses named Manager, Helper or Util: 0'
    },
    ocp: {
      label: 'O \u2014 Open/Closed',
      command: 'before: if (customer.Type == "Gold") \u2026 else if (Type == "Partner") \u2026  \u2192  after: IPricingStrategy resolved from the container',
      effect: 'New behaviour arrives as a new implementation instead of another branch in an existing class. Each customer segment becomes a named strategy, so adding a segment is one new file and the existing strategies are not recompiled, retested or re-reviewed to accommodate it.',
      output: 'files changed per new customer segment: 1 (a new strategy)\ncyclomatic complexity of the pricing entry point: 12 \u2192 2\nstrategies covered by one shared contract suite: 4'
    },
    lsp: {
      label: 'L \u2014 Liskov Substitution',
      command: 'before: ReadOnlyRepository.Archive() throws NotSupportedException  \u2192  after: IReadRepository / IWriteRepository',
      effect: 'An implementation that throws from an inherited method does not satisfy the contract, and every caller suddenly has to know which subtype it holds. The fix is not a better exception message: it is an interface that only declares what every implementation can honour.',
      output: 'implementations that throw NotSupportedException: 0\ncontract tests executed against every implementation: yes\npreconditions strengthened by a subtype: 0'
    },
    isp: {
      label: 'I \u2014 Interface Segregation',
      command: 'before: IRepository<T> with 14 members  \u2192  after: IReadRepository<T> (4) + IWriteRepository<T> (3) + a query port per screen',
      effect: 'A client should not depend on methods it never calls. A god interface forces every test double to implement fourteen members and gives every read-only component write methods it must never use; splitting it by purpose makes each client depend on exactly its own surface.',
      output: 'members a read-only client must implement: 4 (from 14)\nunimplemented members in test doubles: 0\ninterfaces with more than 7 members: 0'
    },
    dip: {
      label: 'D \u2014 Dependency Inversion',
      command: 'before: new SqlOrderRepository(connectionString) inside the domain  \u2192  after: ctor(IOrderRepository, IClock, INotifier) + composition root',
      effect: 'High-level policy depends on abstractions it owns, and the concrete technology is chosen once at the composition root. That is what makes the domain testable without a database and lets the storage target change without touching a business rule.',
      output: 'new statements in domain code: 0\nclock and storage replaced in tests: yes (fake clock, in-memory repository)\nconcrete types named outside the composition root: 0'
    }
  };

  var DEFAULT_OPERATION = 'srp';

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

    root.querySelector('[data-testid="solid-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="solid-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="solid-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('solid-workflow');
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

  global.SolidWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
