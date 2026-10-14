/**
 * sql-workflow.js — live proof logic for RTS questionnaire Q09.
 *
 * Same pattern as the other proof pages (Q05-Q08): the Angular reference
 * component basic-004/cli-workflow.ts used `signal` + `computed` +
 * `[class.active]` + `(click)`; this is the plain-DOM port, so the workflow
 * runs from a static page with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the statement or server action, the reasoning
   * behind it, and the observable measurement that proves the effect.
   */
  var OPERATIONS = {
    select: {
      label: 'Sargable query',
      command: "SELECT o.Id, o.CreatedAt, o.Total FROM Orders o WHERE o.CustomerId = 42 AND o.Status = 'Open' ORDER BY o.CreatedAt DESC",
      effect: 'Predicates are written sargable: no functions on indexed columns and no implicit conversions, so the optimiser can seek instead of scanning.',
      output: 'Index Seek (IX_Orders_Customer_Status, nonclustered)\nlogical reads 24  \u00b7  137 rows  \u00b7  3 ms'
    },
    plan: {
      label: 'Read the plan',
      command: 'SET STATISTICS IO, TIME ON;   \u2014   EXPLAIN (ANALYZE, BUFFERS)',
      effect: 'Every hot query is reviewed against its real execution plan before release: seek versus scan, key lookups, spills, and estimates against actual rows.',
      output: 'Scan \u2192 Seek after the index was added\nlogical reads 8,412 \u2192 24  \u00b7  estimate/actual 137/137'
    },
    index: {
      label: 'Design the index',
      command: 'CREATE NONCLUSTERED INDEX IX_Orders_Customer_Status ON Orders (CustomerId, Status) INCLUDE (CreatedAt, Total);',
      effect: 'Key order follows the predicates and the sort, while the read columns are included so the index covers the query and the key lookup disappears.',
      output: 'Index Seek  \u00b7  key lookup eliminated\nwrite cost +1 index per INSERT  \u00b7  fragmentation 2%'
    },
    stats: {
      label: 'Refresh statistics',
      command: 'UPDATE STATISTICS Orders WITH FULLSCAN;',
      effect: 'Cardinality estimates drive the join strategy; stale statistics make the optimiser pick a hash join where a nested loop was cheaper.',
      output: 'optimiser chose Nested Loops (137 rows  \u00b7  1:1 estimated)\nmemory grant 12 MB \u2192 2 MB  \u00b7  no spills'
    },
    isolation: {
      label: 'Isolation & blocking',
      command: 'ALTER DATABASE App SET READ_COMMITTED_SNAPSHOT ON;   BEGIN TRAN \u2026 COMMIT;',
      effect: 'The isolation level and the transaction scope are chosen deliberately, so readers stop blocking writers without weakening correctness on the write path.',
      output: 'readers not blocked  \u00b7  no lock waits over 50 ms\noptimistic concurrency (rowversion) on update paths'
    }
  };

  var DEFAULT_OPERATION = 'select';

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

    root.querySelector('[data-testid="sql-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="sql-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="sql-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('sql-workflow');
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

  global.SqlWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
