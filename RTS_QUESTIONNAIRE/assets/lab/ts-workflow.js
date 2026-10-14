/**
 * ts-workflow.js — live proof logic for RTS questionnaire Q13.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the language or tooling decision, the reasoning
   * behind it, and the observable measurement that proves it.
   */
  var OPERATIONS = {
    strict: {
      label: 'Strict compiler',
      command: '"strict": true, "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true',
      effect: 'Strict mode is non-negotiable: null checks, no implicit any and verified indexed access, so type errors surface at build time instead of in production.',
      output: 'tsc: 0 errors  \u00b7  0 implicit any\nany occurrences in src: 3 (all at the infrastructure boundary)'
    },
    model: {
      label: 'Model the domain',
      command: 'type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }',
      effect: 'Illegal states are made unrepresentable: a discriminated union forces the caller to handle every branch, while generics keep the payload fully typed.',
      output: 'exhaustive switch  \u00b7  never branch reachable\nno runtime type checks on the happy path'
    },
    boundary: {
      label: 'Validate the boundary',
      command: 'const parsed = OrderSchema.safeParse(await res.json());  if (!parsed.success) return fail(parsed.error);',
      effect: 'Types are erased at runtime, so everything crossing a boundary — HTTP, queue, storage — is parsed and validated, then treated as trusted inside the domain.',
      output: 'schema parse: 1.2 ms per payload\ninvalid payload rejected before the domain sees it'
    },
    async: {
      label: 'Concurrency & cancellation',
      command: 'Promise.allSettled + AbortSignal.timeout(2000) + for await (const page of pages())',
      effect: 'Async work is written with explicit concurrency, timeouts and cancellation, so a slow dependency degrades one part of the screen instead of hanging the request.',
      output: '5 calls  \u00b7  1 aborted at 2 s  \u00b7  partial results kept\nunhandled rejections in the log: 0'
    },
    quality: {
      label: 'Tooling & bundle budget',
      command: 'ESLint (typed rules) + Prettier + tsc --noEmit + Vite/esbuild bundle budget',
      effect: 'Typed lint rules, formatting and a bundle budget keep the codebase consistent and the payload small as the team and the application grow.',
      output: 'lint: 0 errors  \u00b7  0 any escapes\nbundle 212 KB gzip of a 250 KB budget'
    }
  };

  var DEFAULT_OPERATION = 'strict';

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

    root.querySelector('[data-testid="ts-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="ts-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="ts-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('ts-workflow');
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

  global.TsWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
