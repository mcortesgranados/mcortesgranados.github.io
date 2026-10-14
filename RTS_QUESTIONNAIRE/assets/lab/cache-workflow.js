/**
 * cache-workflow.js — live proof logic for RTS questionnaire Q05.
 *
 * Port of the Angular reference component (basic-004 / cli-workflow.ts, which used
 * `signal` + `computed` + `[class.active]` + `(click)`) to plain DOM events, so the
 * same workflow runs from a static page with no build step.
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
   * Every operation documents three things: the exact Redis command, what the
   * application does around it, and the observable result the caller sees.
   */
  var OPERATIONS = {
    hit: {
      label: 'Read (hit)',
      command: 'GET user:42:profile',
      effect: 'Cache-aside read: the value is in Redis, so the database is never touched and the request stays in the sub-millisecond range.',
      output: 'HIT  \u00b7  0.4 ms  \u00b7  TTL 267 s left\n{"id":42,"name":"M. Cortes","plan":"senior"}'
    },
    miss: {
      label: 'Read (miss)',
      command: 'GET user:42:profile  \u2192  (nil)',
      effect: 'Cache miss: read through to the database once, then populate the cache with a jittered TTL so entries do not expire together.',
      output: 'MISS  \u00b7  6.1 ms  \u00b7  source: SQL Server\nSETEX user:42:profile 293 "<json>"  \u2192  OK'
    },
    ttl: {
      label: 'Write + TTL',
      command: 'SET user:42:profile EX 300',
      effect: 'Write-through with an explicit expiration: no cache entry exists without a TTL, and the eviction policy is chosen deliberately.',
      output: 'OK  \u00b7  TTL 300 s (293 s after jitter)\neviction policy: allkeys-lru'
    },
    invalidate: {
      label: 'Invalidate (pub/sub)',
      command: 'PUBLISH profile:changed 42',
      effect: 'Invalidation contract first: publishing an event lets every node drop its own entry, avoiding a blind delete that leaves stale copies behind.',
      output: 'SUBSCRIBERS REPLIED  4/4  \u00b7  1.8 ms\nlocal IMemoryCache entry evicted'
    },
    lock: {
      label: 'Distributed lock',
      command: 'SET lock:profile:42 <token> NX PX 5000',
      effect: 'Single-flight lock in front of the expensive recomputation, so a stampede of concurrent misses produces one database query instead of hundreds.',
      output: 'OK  \u00b7  lock held by worker-3 (ttl 5000 ms)\nother workers: single-flight wait'
    }
  };

  var DEFAULT_OPERATION = 'hit';

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

    root.querySelector('[data-testid="cache-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="cache-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="cache-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('cache-workflow');
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

  global.CacheWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
