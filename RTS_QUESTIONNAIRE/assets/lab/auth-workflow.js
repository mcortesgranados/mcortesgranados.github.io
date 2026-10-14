/**
 * auth-workflow.js — live proof logic for RTS questionnaire Q08.
 *
 * Same pattern as di-workflow.js (Q07), orm-workflow.js (Q06) and
 * cache-workflow.js (Q05): the Angular reference component
 * basic-004/cli-workflow.ts used `signal` + `computed` + `[class.active]` +
 * `(click)`; this is the plain-DOM port, so the workflow runs from a static page
 * with no build step.
 */
(function (global) {
  'use strict';

  /**
   * Each operation documents the protocol step, the security reasoning behind it,
   * and the observable result the client or API produces.
   */
  var OPERATIONS = {
    authorize: {
      label: 'Authorize (PKCE)',
      command: 'GET /authorize?response_type=code&code_challenge=<S256>&code_challenge_method=S256',
      effect: 'The browser is sent to the identity provider with PKCE, so the client never sees the user credentials and an intercepted code is useless without the verifier.',
      output: '302 \u2192 idp/authorize  \u00b7  state + nonce bound to the session\ncode_challenge_method=S256  \u00b7  redirect_uri exact match'
    },
    token: {
      label: 'Exchange code',
      command: 'POST /token  grant_type=authorization_code&code=<one-time>&code_verifier=<v>',
      effect: 'The back-channel exchange turns a one-time code into an access token, an ID token and a refresh token; tokens never travel through the browser.',
      output: 'access_token (JWT, 15 min)  \u00b7  id_token  \u00b7  refresh_token (rotated)\nscope: openid profile api.read'
    },
    validate: {
      label: 'Validate token',
      command: 'ValidateIssuer + ValidateAudience + ValidateLifetime + IssuerSigningKeys (JWKS)',
      effect: 'Every request is validated against issuer, audience, lifetime and the provider signing keys — never by decoding the token and trusting its claims.',
      output: 'signature RS256 verified via JWKS (cached)\niss \u2713  aud \u2713  exp \u2713  \u00b7  replayed jti rejected'
    },
    claims: {
      label: 'Authorize by policy',
      command: '[Authorize(Policy = "orders.write")]  \u2192  RequireClaim("scope", "orders.write")',
      effect: 'Authorization is evaluated as a policy over scopes and claims instead of hard-coded role strings, so least privilege is expressed once and enforced everywhere.',
      output: 'policy orders.write \u2192 satisfied (scope + tenant claim)\n401 when unauthenticated  \u00b7  403 when authenticated but not entitled'
    },
    refresh: {
      label: 'Rotate refresh',
      command: 'POST /token  grant_type=refresh_token&refresh_token=<previous>',
      effect: 'Refresh tokens rotate on every use and reuse detection revokes the whole family, which is the standard defence when a token is stolen.',
      output: 'new access + refresh token issued\nreuse of the previous token \u2192 family revoked, all sessions closed'
    }
  };

  var DEFAULT_OPERATION = 'authorize';

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

    root.querySelector('[data-testid="auth-command"]').textContent = '$ ' + detail.command;
    root.querySelector('[data-testid="auth-effect"]').textContent = detail.effect;
    root.querySelector('[data-testid="auth-output"]').textContent = detail.output;
    root.setAttribute('data-operation', name);

    return detail;
  }

  function init() {
    var root = document.getElementById('auth-workflow');
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

  global.AuthWorkflow = {
    OPERATIONS: OPERATIONS,
    selectOperation: selectOperation,
    init: init
  };
})(window);
