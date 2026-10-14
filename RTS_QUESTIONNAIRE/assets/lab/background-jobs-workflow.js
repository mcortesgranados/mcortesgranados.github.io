/**
 * background-jobs-workflow.js — live proof logic for RTS questionnaire Q38.
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
   * Each operation is one aspect of background processing: what is pushed off the
   * request path, how it runs in-process, how it runs on a schedule, which platform
   * fits which shape of work, and what makes a job reliable rather than merely
   * queued.
   */
  var OPERATIONS = {
    offload: {
      label: 'What leaves the request path',
      command: 'emails  \u00b7  PDF generation  \u00b7  exports  \u00b7  third-party sync  \u00b7  ETL  \u00b7  AI inference  \u2192  enqueue + job id  \u2192  the UI polls or subscribes for status',
      effect: 'The rule is mechanical rather than a judgement call: anything whose duration is decided by somebody else \u2014 a mail server, a report over a million rows, a model \u2014 does not run inside a request. It is enqueued with an id, the response returns that id immediately, and the client polls or subscribes for the result, so a slow dependency degrades one screen instead of exhausting the request threads.',
      output: 'job types moved off the request path: 9\nrequest timeouts caused by background work: 0\njobs that block until they return a result: 0\nstatus visible to the user for every job type: yes'
    },
    inprocess: {
      label: 'In-process workers',
      command: 'BackgroundService + a bounded Channel<T>  \u2192  N consumers  \u00b7  IHostedService for startup and shutdown hooks',
      effect: 'A queue that never leaves the process is the right answer for work that must not survive a deploy: a bounded channel gives backpressure instead of unbounded growth, N consumers put the concurrency limit in one place, and the worker honours the shutdown token so a rollout drains rather than truncates. When the work does have to survive a restart, it stops being a channel and becomes a real queue.',
      output: 'bounded channels that can refuse a write: yes, never unbounded growth\nconsumer count per worker: configured, default 4\ntasks lost during a rolling deploy: 0 (drained before shutdown)\nused only where losing the work on restart is acceptable: yes'
    },
    scheduled: {
      label: 'Scheduled and recurring jobs',
      command: 'a cron expression  \u00b7  a distributed lock with a fencing token  \u00b7  a concurrency policy  \u00b7  an explicit misfire policy',
      effect: 'A recurring job raises three questions a cron expression does not answer: which instance runs it, what happens if the previous run is still going, and what happens if the schedule fired while the service was down. The fencing token answers the first, the concurrency policy answers the second, and the misfire policy is decided per job rather than left to a library default.',
      output: 'replicas able to run the same scheduled job: 1 (fencing token)\noverlapping runs: prevented by a concurrency policy, not by hoping\nmisfire after deployment downtime: defined per job (fire once, or skip)\nlong runs that extend their lease with a heartbeat: yes'
    },
    platforms: {
      label: 'Queues, batch and orchestration',
      command: 'SQS/SNS + EventBridge  \u00b7  Step Functions  \u00b7  Lambda triggers  \u00b7  Airflow DAGs  \u00b7  Celery/APScheduler  \u00b7  Spring Batch  \u00b7  Hangfire/Quartz',
      effect: 'The choice follows the shape of the work: a plain queue for independent tasks, a state machine for a multi-step workflow that needs retries and compensation, a DAG for a batch pipeline whose steps have dependencies and a backfill story, and an in-process scheduler only for jobs whose failure is cosmetic. The job keeps the same contract in any of them.',
      output: 'stacks implementing the same job contract: 4 (.NET, Java, Python, cloud-native)\nmulti-step work modelled as a state machine: yes (Step Functions)\nbatches with dependency and backfill semantics: Airflow\njob definitions held in version control: all of them'
    },
    reliability: {
      label: 'Job reliability',
      command: 'idempotent handler  \u00b7  visibility timeout with a heartbeat  \u00b7  retry with backoff and jitter  \u00b7  poison message quarantined after N attempts  \u00b7  backlog metrics',
      effect: 'A job is delivered at least once, so its handler is written to be safe to run twice. The visibility timeout is extended by a heartbeat while a long job runs, which is what stops the message being redelivered to a second worker mid-flight. A message that fails deterministically is quarantined after its attempt budget instead of being retried forever, and the backlog together with the age of its oldest message is a metric with an alert on it.',
      output: 'jobs safe to run twice: 100%\nduplicate side effects after a redelivery: 0\npoison messages retried indefinitely: 0 (quarantined after N attempts)\nvisibility timeout extended by a heartbeat: yes\nbacklog and oldest-message age alerted: yes'
    }
  };

  var DEFAULT_OPERATION = 'offload';

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

    root.querySelector('[data-testid="jobs-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="jobs-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="jobs-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('background-jobs-workflow');
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

  global.BackgroundJobsWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
