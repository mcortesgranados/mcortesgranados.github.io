/**
 * nosql-workflow.js — live proof logic for RTS questionnaire Q10.
 *
 * Same pattern as the other proof pages (Q05-Q09): the Angular reference
 * component basic-004/cli-workflow.ts used `signal` + `computed` +
 * `[class.active]` + `(click)`; this is the plain-DOM port, so the workflow
 * runs from a static page with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the design decision or statement, the reasoning
   * behind it, and the observable result the call produces.
   */
  var OPERATIONS = {
    access: {
      label: 'Model from access patterns',
      command: 'PK = CUSTOMER#42   SK = ORDER#2026-10-14#8842',
      effect: 'The key schema is derived from the access patterns first: one table with composite keys and overloaded GSIs, instead of one table per entity.',
      output: 'Query (single partition)  \u00b7  137 items  \u00b7  3.1 ms  \u00b7  1 RCU\nno Scan anywhere on the read path'
    },
    index: {
      label: 'Secondary indexes',
      command: 'GSI1: PK = STATUS#Open, SK = CREATED_AT   \u00b7   MongoDB: { status: 1, createdAt: -1 }',
      effect: 'Every secondary index exists to serve a named query. In MongoDB the compound index follows equality, sort, range; in DynamoDB the GSI carries the alternate access pattern.',
      output: 'GSI1 queried  \u00b7  item collection 137\nMongoDB  keysExamined 137  \u00b7  docsExamined 137  \u00b7  IXSCAN (no COLLSCAN)'
    },
    embed: {
      label: 'Embed vs reference',
      command: 'embed order lines inside the order  \u00b7  reference the customer',
      effect: 'Aggregate boundaries decide the shape: data read together is stored together when the list is bounded, while shared or unbounded data is referenced.',
      output: '1 read per order screen (was 3 round trips)\ndocument 4.2 KB  \u00b7  bounded list of 50 lines'
    },
    consistency: {
      label: 'Transactions & idempotency',
      command: 'TransactWriteItems (3 items)   \u00b7   conditional write on version',
      effect: 'A bounded set of items is written atomically; everything else is designed for eventual consistency with idempotent consumers, so a retry cannot double-apply an effect.',
      output: 'transaction all-or-nothing  \u00b7  3 items\nconditional write on version  \u00b7  retry replayed safely'
    },
    capacity: {
      label: 'Capacity & hot keys',
      command: 'on-demand \u2192 provisioned + auto scaling   \u00b7   write sharding suffix on the key',
      effect: 'The partition key decides whether the table scales: high-cardinality keys and write sharding prevent a hot partition, while TTL and streams keep the tail clean.',
      output: 'hot partition removed (key + shard suffix)\nconsumed 340 WCU of 1,000  \u00b7  throttles 0'
    }
  };

  var DEFAULT_OPERATION = 'access';

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

    root.querySelector('[data-testid="nosql-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="nosql-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="nosql-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('nosql-workflow');
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

  global.NoSqlWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
