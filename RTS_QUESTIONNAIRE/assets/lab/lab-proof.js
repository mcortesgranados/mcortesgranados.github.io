/**
 * lab-proof.js — read-only source explorer + token highlighter for the proof pages.
 *
 * Static-HTML port of the Angular reference component
 * (shared/readonly-code-explorer, which embedded CodeMirror read-only with
 * one-dark): the file tree switches the selected file and the selected file is
 * rendered with line numbers and token colours. Sources are embedded, so the
 * explorer works offline and from file:// with no bundler.
 *
 * Angular                                 -> this port
 *   input.required<files>()                 -> SOURCES (embedded below)
 *   signal('') + computed(selectedFile)     -> selectFile() + a local variable
 *   @for (file of files(); track ...)       -> buildFileList()
 *   CodeMirror read-only + one-dark         -> highlightLines() + .token-* classes
 */
(function (global) {
  'use strict';

  var BUILT_IN_SOURCES = [
    {
      name: 'cache-workflow.js',
      path: 'assets/lab/cache-workflow.js',
      language: 'javascript',
      source: "/**\n * cache-workflow.js — live proof logic for RTS questionnaire Q05.\n *\n * Port of the Angular reference component (basic-004 / cli-workflow.ts, which used\n * `signal` + `computed` + `[class.active]` + `(click)`) to plain DOM events, so the\n * same workflow runs from a static page with no build step.\n *\n * Angular                              -> this static proof\n *   signal<CliTask>('serve')             -> the active operation stored in OPERATIONS\n *   computed(() => TASKS[selected()])    -> selectOperation() looks the detail up\n *   (click)=\"selectTask('build')\"        -> button click listener\n *   [class.active]=\"...\"                 -> classList.toggle('active', ...)\n *   {{ detail().command }} etc.          -> textContent on the data-testid nodes\n */\n(function (global) {\n  'use strict';\n\n  /**\n   * Every operation documents three things: the exact Redis command, what the\n   * application does around it, and the observable result the caller sees.\n   */\n  var OPERATIONS = {\n    hit: {\n      label: 'Read (hit)',\n      command: 'GET user:42:profile',\n      effect: 'Cache-aside read: the value is in Redis, so the database is never touched and the request stays in the sub-millisecond range.',\n      output: 'HIT  \\u00b7  0.4 ms  \\u00b7  TTL 267 s left\\n{\"id\":42,\"name\":\"M. Cortes\",\"plan\":\"senior\"}'\n    },\n    miss: {\n      label: 'Read (miss)',\n      command: 'GET user:42:profile  \\u2192  (nil)',\n      effect: 'Cache miss: read through to the database once, then populate the cache with a jittered TTL so entries do not expire together.',\n      output: 'MISS  \\u00b7  6.1 ms  \\u00b7  source: SQL Server\\nSETEX user:42:profile 293 \"<json>\"  \\u2192  OK'\n    },\n    ttl: {\n      label: 'Write + TTL',\n      command: 'SET user:42:profile EX 300',\n      effect: 'Write-through with an explicit expiration: no cache entry exists without a TTL, and the eviction policy is chosen deliberately.',\n      output: 'OK  \\u00b7  TTL 300 s (293 s after jitter)\\neviction policy: allkeys-lru'\n    },\n    invalidate: {\n      label: 'Invalidate (pub/sub)',\n      command: 'PUBLISH profile:changed 42',\n      effect: 'Invalidation contract first: publishing an event lets every node drop its own entry, avoiding a blind delete that leaves stale copies behind.',\n      output: 'SUBSCRIBERS REPLIED  4/4  \\u00b7  1.8 ms\\nlocal IMemoryCache entry evicted'\n    },\n    lock: {\n      label: 'Distributed lock',\n      command: 'SET lock:profile:42 <token> NX PX 5000',\n      effect: 'Single-flight lock in front of the expensive recomputation, so a stampede of concurrent misses produces one database query instead of hundreds.',\n      output: 'OK  \\u00b7  lock held by worker-3 (ttl 5000 ms)\\nother workers: single-flight wait'\n    }\n  };\n\n  var DEFAULT_OPERATION = 'hit';\n\n  /**\n   * Applies one operation to the DOM subtree of the workflow component.\n   * Returns the detail object, or null when the operation is unknown.\n   */\n  function selectOperation(root, name) {\n    var detail = OPERATIONS[name];\n    if (!root || !detail) return null;\n\n    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {\n      var isActive = button.getAttribute('data-op') === name;\n      button.classList.toggle('active', isActive);\n      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');\n    });\n\n    root.querySelector('[data-testid=\"cache-command\"]').textContent = '$ ' + detail.command;\n    root.querySelector('[data-testid=\"cache-effect\"]').textContent = detail.effect;\n    root.querySelector('[data-testid=\"cache-output\"]').textContent = detail.output;\n    root.setAttribute('data-operation', name);\n\n    return detail;\n  }\n\n  function init() {\n    var root = document.getElementById('cache-workflow');\n    if (!root) return;\n\n    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {\n      button.addEventListener('click', function () {\n        selectOperation(root, button.getAttribute('data-op'));\n      });\n    });\n\n    selectOperation(root, root.getAttribute('data-operation') || DEFAULT_OPERATION);\n  }\n\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', init);\n  } else {\n    init();\n  }\n\n  global.CacheWorkflow = {\n    OPERATIONS: OPERATIONS,\n    selectOperation: selectOperation,\n    init: init\n  };\n})(window);\n"
    },
    {
      name: 'cache-aside.cs',
      path: 'assets/lab/cache-aside.cs',
      language: 'csharp',
      source: "using System;\nusing System.Text.Json;\nusing System.Threading.Tasks;\nusing StackExchange.Redis;\n\nnamespace Rts.Questionnaire.Caching;\n\n/// <summary>\n/// Cache-aside over Redis with an explicit invalidation contract.\n/// The four rules encoded here: every entry has a TTL, TTLs are jittered,\n/// the database is written before the cache, and readers that miss share a\n/// single-flight lock instead of hammering the database.\n/// </summary>\npublic sealed class CacheAsideProfileStore\n{\n    private const string InvalidatedChannel = \"profile:changed\";\n    private static readonly TimeSpan FreshTtl = TimeSpan.FromMinutes(5);\n\n    private readonly IDatabase _redis;\n    private readonly IProfileRepository _repository;\n\n    public CacheAsideProfileStore(IConnectionMultiplexer redis, IProfileRepository repository)\n    {\n        _redis = redis.GetDatabase();\n        _repository = repository;\n    }\n\n    public async Task<Profile?> GetAsync(int id)\n    {\n        var key = Key(id);\n\n        var cached = await _redis.StringGetAsync(key);\n        if (!cached.IsNullOrEmpty)                                  // cache hit\n            return JsonSerializer.Deserialize<Profile>(cached!);\n\n        var token = Guid.NewGuid().ToString(\"N\");\n        var lockKey = $\"lock:{key}\";\n\n        if (await _redis.StringSetAsync(lockKey, token, TimeSpan.FromSeconds(5), When.NotExists))\n        {\n            try\n            {\n                var profile = await _repository.FindAsync(id);        // single-flight read\n                if (profile is null) return null;\n\n                await _redis.StringSetAsync(key, JsonSerializer.Serialize(profile), JitteredTtl());\n                return profile;\n            }\n            finally\n            {\n                await _redis.KeyDeleteAsync(lockKey);                 // release by owner\n            }\n        }\n\n        await Task.Delay(50);                                         // wait, then retry once\n        var retry = await _redis.StringGetAsync(key);\n        return retry.IsNullOrEmpty ? await _repository.FindAsync(id) : JsonSerializer.Deserialize<Profile>(retry!);\n    }\n\n    public async Task WriteAsync(Profile profile)\n    {\n        await _repository.SaveAsync(profile);                         // database is the source of truth\n        await _redis.StringSetAsync(Key(profile.Id), JsonSerializer.Serialize(profile), JitteredTtl());\n        await _redis.PublishAsync(new RedisChannel(InvalidatedChannel, RedisChannel.PatternMode.Literal), profile.Id);\n    }\n\n    private static string Key(int id) => $\"user:{id}:profile\";\n\n    /// <summary>Spreads expiry so a whole keyspace cannot expire in the same second.</summary>\n    private static TimeSpan JitteredTtl()\n        => FreshTtl + TimeSpan.FromSeconds(Random.Shared.Next(0, 30));\n}\n"
    },
    {
      name: 'cache-aside.spec.ts',
      path: 'assets/lab/cache-aside.spec.ts',
      language: 'typescript',
      source: "import { OPERATIONS, selectOperation } from './cache-workflow';\n\n/**\n * Contract tests for the Q05 cache proof.\n * They assert the rules the answer claims: every operation is documented,\n * every write carries an expiration, and invalidation is event-based.\n */\ndescribe('cache-workflow', () => {\n  it('publishes a command, an effect and an observable result per operation', () => {\n    Object.values(OPERATIONS).forEach((operation) => {\n      expect(operation.command.length).toBeGreaterThan(0);\n      expect(operation.effect.length).toBeGreaterThan(0);\n      expect(operation.output.length).toBeGreaterThan(0);\n    });\n  });\n\n  it('documents an expiration on every write path', () => {\n    expect(OPERATIONS.ttl.command).toContain('EX ');\n    expect(OPERATIONS.ttl.output).toContain('TTL');\n  });\n\n  it('invalidates through pub/sub instead of deleting behind other nodes', () => {\n    expect(OPERATIONS.invalidate.command).toContain('PUBLISH');\n    expect(OPERATIONS.invalidate.effect).toMatch(/every node|invalidation/i);\n  });\n\n  it('protects the database from a stampede with a single-flight lock', () => {\n    expect(OPERATIONS.lock.command).toContain('NX PX');\n    expect(OPERATIONS.lock.effect).toMatch(/single-flight|stampede/i);\n  });\n\n  it('switches the rendered result when another operation is selected', () => {\n    document.body.innerHTML = `\n      <section id=\"cache-workflow\" data-operation=\"hit\">\n        <div class=\"task-buttons\"><button data-op=\"hit\" class=\"active\">Read (hit)</button><button data-op=\"lock\">Lock</button></div>\n        <div class=\"command-result\">\n          <code data-testid=\"cache-command\"></code>\n          <p data-testid=\"cache-effect\"></p>\n          <pre data-testid=\"cache-output\"></pre>\n        </div>\n      </section>`;\n\n    const root = document.getElementById('cache-workflow') as HTMLElement;\n    selectOperation(root, 'lock');\n\n    expect(root.querySelector('[data-testid=\"cache-command\"]')?.textContent).toContain('NX PX');\n    expect(root.getAttribute('data-operation')).toBe('lock');\n    expect(root.querySelector('[data-op=\"lock\"]')?.classList.contains('active')).toBe(true);\n  });\n});\n"
    }
  ];

  // A page can supply its own file set by defining window.LAB_SOURCES before this
  // script loads (see assets/lab/q06-sources.js). Otherwise the built-in Q05 set
  // above is used, so existing proof pages keep working unchanged.
  var SOURCES = (Array.isArray(global.LAB_SOURCES) && global.LAB_SOURCES.length > 0)
    ? global.LAB_SOURCES
    : BUILT_IN_SOURCES;

  var KEYWORDS = {
    javascript: ('import from export default class const let var function return new if else for of in while switch case break ' +
      'continue this typeof instanceof try catch finally throw async await yield null undefined true false void delete extends ' +
      'static document window get set').split(' '),
    typescript: ('import from export default class const let var function return new if else for of in while switch case break ' +
      'continue this typeof instanceof try catch finally throw async await yield null undefined true false void delete extends ' +
      'interface type readonly public private protected enum implements declare as any string number boolean never unknown ' +
      'expect describe it document').split(' '),
    csharp: ('using namespace public private protected internal sealed static readonly const class record interface struct enum new ' +
      'return if else for foreach while switch case break continue try catch finally throw async await var this base null true false ' +
      'void string int bool double decimal long Task ValueTask Guid TimeSpan DateTime Random JsonSerializer IDatabase When').split(' '),
    sql: ('select from where and or not null is in exists join inner left right outer full on group by having order asc desc limit ' +
      'offset insert into values update set delete create alter drop index unique clustered nonclustered include table view procedure ' +
      'function trigger begin commit rollback transaction isolation level read write snapshot with as case when then else end union ' +
      'all distinct top explain analyze vacuum int bigint smallint numeric decimal varchar nvarchar char text date timestamp boolean ' +
      'jsonb primary key foreign references default constraint cascade statistics fullscan').split(' '),
    json: 'true false null'.split(' '),
    yaml: ('name on push branches workflow_dispatch permissions id-token contents concurrency group cancel-in-progress jobs ' +
      'runs-on steps uses with run needs environment if always strategy matrix timeout-minutes outputs defaults').split(' '),
    graphql: ('schema query mutation subscription type interface union enum input scalar directive implements extend fragment on ' +
      'true false null').split(' '),
    python: ('def class import from return async await with as None True False for in if elif else try except finally raise lambda ' +
      'yield self not and or is pass global nonlocal assert del while break continue').split(' ')
  };

  // The identifier/string/number part is shared; only the line-comment syntax differs
  // between languages (// in C-family code, -- in SQL).
  var TOKEN_BODY = "('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\")|\\b(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b|(@[A-Za-z_]\\w*)|\\b([A-Za-z_$][\\w$]*)\\b";
  var TOKEN_RE = new RegExp('(\\/\\/[^\\n]*)|' + TOKEN_BODY, 'g');
  var SQL_TOKEN_RE = new RegExp('(--[^\\n]*)|' + TOKEN_BODY, 'g');
  var YAML_TOKEN_RE = new RegExp('(#[^\\n]*)|' + TOKEN_BODY, 'g');
  var TOKEN_PATTERNS = { sql: SQL_TOKEN_RE, yaml: YAML_TOKEN_RE, graphql: YAML_TOKEN_RE, python: YAML_TOKEN_RE };

  function escapeHtml(value) {
    return value.replace(/[&<>]/g, function (ch) {
      if (ch === '&') return '&amp;';
      if (ch === '<') return '&lt;';
      return '&gt;';
    });
  }

  function span(className, text) {
    return '<span class="' + className + '">' + escapeHtml(text) + '</span>';
  }

  function tokenise(text, language) {
    var keywords = KEYWORDS[language] || [];
    var pattern = TOKEN_PATTERNS[language] || TOKEN_RE;
    var out = '';
    var lastIndex = 0;
    var match;
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      out += escapeHtml(text.slice(lastIndex, match.index));

      var token = match[0];
      var className = '';
      if (match[1]) className = 'token-comment';
      else if (match[2]) className = 'token-string';
      else if (match[3]) className = 'token-number';
      else if (match[4]) className = 'token-decorator';
      else if (keywords.indexOf(token) !== -1) className = 'token-keyword';

      out += className ? span(className, token) : escapeHtml(token);
      lastIndex = match.index + token.length;
    }

    return out + escapeHtml(text.slice(lastIndex));
  }

  /**
   * Highlights a whole source file line by line, carrying the block-comment
   * state across lines so multi-line /* ... *\/ comments stay coloured.
   */
  function highlightLines(source, language) {
    var lines = source.replace(/\r\n/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();

    var insideBlockComment = false;

    return lines.map(function (line) {
      var html = '';
      var index = 0;

      while (index < line.length) {
        if (insideBlockComment) {
          var closeAt = line.indexOf('*/', index);
          if (closeAt === -1) {
            html += span('token-comment', line.slice(index));
            index = line.length;
          } else {
            html += span('token-comment', line.slice(index, closeAt + 2));
            index = closeAt + 2;
            insideBlockComment = false;
          }
          continue;
        }

        var openAt = line.indexOf('/*', index);
        if (openAt === -1) {
          html += tokenise(line.slice(index), language);
          index = line.length;
          continue;
        }

        html += tokenise(line.slice(index, openAt), language);
        var closingAt = line.indexOf('*/', openAt + 2);
        if (closingAt === -1) {
          html += span('token-comment', line.slice(openAt));
          insideBlockComment = true;
          index = line.length;
        } else {
          html += span('token-comment', line.slice(openAt, closingAt + 2));
          index = closingAt + 2;
        }
      }

      return html;
    });
  }

  function renderCode(container, file) {
    var lines = highlightLines(file.source, file.language);
    var code = document.createElement('code');

    lines.forEach(function (html) {
      var line = document.createElement('span');
      line.className = 'code-line';
      line.innerHTML = html || '&nbsp;';
      code.appendChild(line);
    });

    container.replaceChildren(code);
    container.setAttribute('aria-label', 'Source code for ' + file.name);
  }

  function buildFileList(root, onSelect) {
    var list = root.querySelector('#file-list');
    if (!list) return;

    SOURCES.forEach(function (file) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-path', file.path);
      button.innerHTML = '<span aria-hidden="true">\uD83D\uDCC4</span>';

      var label = document.createElement('span');
      label.textContent = file.name;
      button.appendChild(label);

      button.addEventListener('click', function () {
        if (root.getAttribute('data-selected') === file.path) return;
        onSelect(file);
      });

      item.appendChild(button);
      list.appendChild(item);
    });
  }

  function init() {
    var root = document.getElementById('code-explorer');
    if (!root) return;

    var nameNode = root.querySelector('#file-name');
    var pathNode = root.querySelector('#file-path');
    var languageNode = root.querySelector('#file-language');
    var viewer = root.querySelector('#code-viewer');

    function selectFile(file) {
      root.setAttribute('data-selected', file.path);

      Array.prototype.forEach.call(root.querySelectorAll('.file-tree button'), function (button) {
        var isSelected = button.getAttribute('data-path') === file.path;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-current', isSelected ? 'page' : 'false');
      });

      if (nameNode) nameNode.textContent = file.name;
      if (pathNode) pathNode.textContent = file.path;
      if (languageNode) languageNode.textContent = file.language;
      if (viewer) renderCode(viewer, file);
    }

    buildFileList(root, selectFile);
    selectFile(SOURCES[0]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LabProof = {
    SOURCES: SOURCES,
    highlightLines: highlightLines,
    selectFile: init
  };
})(window);
