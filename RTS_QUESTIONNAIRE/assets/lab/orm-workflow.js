/**
 * orm-workflow.js — live proof logic for RTS questionnaire Q06.
 *
 * Same pattern as cache-workflow.js (Q05): the Angular reference component
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
   * Each operation documents the data-access call, the reasoning behind the
   * choice, and the observable result (rows, timing, generated SQL).
   */
  var OPERATIONS = {
    linq: {
      label: 'EF Core LINQ',
      command: 'db.Orders.Where(o => o.CustomerId == 42).OrderByDescending(o => o.CreatedAt).Take(20).ToListAsync()',
      effect: 'EF Core translates the expression tree to set-based SQL, so filtering and paging happen in the database instead of in memory.',
      output: 'SELECT TOP(20) [o].[Id], [o].[CustomerId], [o].[CreatedAt], [o].[Total]\nFROM [Orders] AS [o]\nWHERE [o].[CustomerId] = @__customerId_0\nORDER BY [o].[CreatedAt] DESC\n-- 4 ms  \u00b7  20 rows'
    },
    nplus1: {
      label: 'Fix N+1',
      command: 'db.Customers.Include(c => c.Orders).AsSplitQuery()',
      effect: 'Replaces a lazy-loading loop that fired one query per row with a single set-based read, so the screen stops issuing N+1 round trips.',
      output: 'BEFORE: 1 + 137 queries  \u00b7  812 ms\nAFTER : 2 split queries  \u00b7  41 ms  \u00b7  137 customers'
    },
    compiled: {
      label: 'No-tracking + compiled',
      command: 'db.Products.AsNoTracking().Where(p => p.Active).ToListAsync()   +   EF.CompileAsyncQuery(...)',
      effect: 'Read-only paths skip the change tracker and reuse a compiled query, removing tracking allocation and repeated query-compilation cost.',
      output: 'rows: 1,240  \u00b7  allocations: -38%\ncompiled query: cache hit  \u00b7  2.3 ms'
    },
    dapper: {
      label: 'Dapper hot path',
      command: 'connection.QueryAsync<OrderReport>(sql, new { customerId = 42 })',
      effect: 'Dapper maps the result set straight onto the DTO with parameterised SQL: no expression tree and no tracking, with exact control over the plan.',
      output: 'multi-map: order + customer + lines\n5.1 ms  \u00b7  137 rows  \u00b7  parameterised'
    },
    uow: {
      label: 'Unit of Work commit',
      command: 'await unitOfWork.SaveChangesAsync();  await transaction.CommitAsync();',
      effect: 'The Unit of Work aggregates tracked changes and commits them inside one explicit transaction, so a business operation either completes fully or rolls back.',
      output: 'BEGIN TRAN  \u00b7  3 entities tracked  \u00b7  0 concurrency conflicts\nCOMMIT  \u00b7  12.4 ms'
    }
  };

  var DEFAULT_OPERATION = 'linq';

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

    root.querySelector('[data-testid="orm-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="orm-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="orm-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('orm-workflow');
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

  global.OrmWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
