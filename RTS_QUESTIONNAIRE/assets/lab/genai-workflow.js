/**
 * genai-workflow.js — live proof logic for RTS questionnaire Q15.
 *
 * Same pattern as the other proof pages: the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the design decision, the reasoning behind it, and
   * the observable measurement that keeps the system honest.
   */
  var OPERATIONS = {
    rag: {
      label: 'Retrieval-grounded answers',
      command: 'embed(query) \u2192 vector search (top-k) \u2192 prompt with context \u2192 answer with citations',
      effect: 'The model answers from retrieved context and cites it, instead of answering from memory. That is what makes an answer verifiable and auditable by the business.',
      output: 'top-8 of 12,400 chunks  \u00b7  recall@8 0.94\n6 of 6 claims resolve to a source'
    },
    finetune: {
      label: 'Fine-tune vs prompt',
      command: 'QLoRA (r=16, 4-bit) on Llama-3 8B   vs   prompt + few-shot',
      effect: 'Fine-tuning is chosen only after prompting and retrieval plateau: it changes style and format, not facts, and it needs a held-out set to prove the gain.',
      output: 'adapter 42 MB  \u00b7  task set 87% \u2192 94%\nfactual accuracy left to retrieval, not to the weights'
    },
    agent: {
      label: 'Agentic tools over MCP',
      command: 'tools/list \u2192 tools/call  with typed schema, and confirmation for anything that writes',
      effect: 'An agent acts only through explicit, schema-typed tools, so its reach is bounded by the contract and every call is logged and reviewable.',
      output: '3 tools exposed  \u00b7  1 write tool behind confirmation\narguments validated before execution'
    },
    guardrails: {
      label: 'Guardrails & privacy',
      command: 'PII redaction  \u00b7  prompt-injection checks  \u00b7  tool allow-list  \u00b7  output schema validation',
      effect: 'Guardrails sit around the model, not inside it: data minimisation before the prompt, injection checks on retrieved text, and validation of anything the system will act on.',
      output: 'PII masked in 100% of prompts  \u00b7  4 injection attempts blocked\noutput validated against a strict schema'
    },
    evals: {
      label: 'Evaluation & cost',
      command: 'golden set (140 cases) + LLM-as-judge + regression on every prompt or model change',
      effect: 'Prompts and model versions are treated like code: every change is measured against a golden set before release, with cost and latency tracked per request.',
      output: 'eval 138/140  \u00b7  1 prompt drift caught\n0.9 cents per request  \u00b7  p95 1.8 s'
    }
  };

  var DEFAULT_OPERATION = 'rag';

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

    root.querySelector('[data-testid="genai-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="genai-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="genai-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('genai-workflow');
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

  global.GenaiWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
