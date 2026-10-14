import { OPERATIONS, selectOperation } from './auth-workflow';

/**
 * Contract tests for the Q08 identity proof.
 * They assert the rules the answer claims: PKCE on public clients, full token
 * validation, policy-based authorization and refresh-token rotation.
 */
describe('auth-workflow', () => {
  it('publishes a protocol step, an effect and an observable result per operation', () => {
    Object.values(OPERATIONS).forEach((operation) => {
      expect(operation.command.length).toBeGreaterThan(0);
      expect(operation.effect.length).toBeGreaterThan(0);
      expect(operation.output.length).toBeGreaterThan(0);
    });
  });

  it('uses Authorization Code with PKCE for public clients', () => {
    expect(OPERATIONS.authorize.command).toContain('code_challenge_method=S256');
    expect(OPERATIONS.authorize.output).toContain('redirect_uri');
  });

  it('never trusts a decoded token: issuer, audience and lifetime are validated', () => {
    expect(OPERATIONS.validate.command).toContain('ValidateIssuer');
    expect(OPERATIONS.validate.command).toContain('ValidateAudience');
    expect(OPERATIONS.validate.command).toContain('JWKS');
  });

  it('expresses authorization as a policy over scopes and claims', () => {
    expect(OPERATIONS.claims.command).toContain('Policy');
    expect(OPERATIONS.claims.effect).toMatch(/policy/i);
  });

  it('rotates refresh tokens and revokes the family on reuse', () => {
    expect(OPERATIONS.refresh.command).toContain('grant_type=refresh_token');
    expect(OPERATIONS.refresh.output).toMatch(/reuse[\s\S]*revoked/);
  });

  it('switches the shown protocol step when another operation is selected', () => {
    document.body.innerHTML = `
      <section id="auth-workflow" data-operation="authorize">
        <div class="task-buttons"><button data-op="authorize" class="active">Authorize</button><button data-op="validate">Validate token</button></div>
        <div class="command-result">
          <code data-testid="auth-command"></code>
          <p data-testid="auth-effect"></p>
          <pre data-testid="auth-output"></pre>
        </div>
      </section>`;

    const root = document.getElementById('auth-workflow') as HTMLElement;
    selectOperation(root, 'validate');

    expect(root.querySelector('[data-testid="auth-command"]')?.textContent).toContain('ValidateIssuer');
    expect(root.getAttribute('data-operation')).toBe('validate');
    expect(root.querySelector('[data-op="validate"]')?.classList.contains('active')).toBe(true);
  });
});
