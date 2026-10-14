import { OPERATIONS, selectOperation } from './di-workflow';

/**
 * Contract tests for the Q07 dependency-injection proof.
 * They assert the rules the answer claims: lifetimes are explicit, cross-cutting
 * behaviour is decorated, and an invalid graph is rejected at start-up.
 */
describe('di-workflow', () => {
  it('publishes a registration, an effect and an observable result per operation', () => {
    Object.values(OPERATIONS).forEach((operation) => {
      expect(operation.command.length).toBeGreaterThan(0);
      expect(operation.effect.length).toBeGreaterThan(0);
      expect(operation.output.length).toBeGreaterThan(0);
    });
  });

  it('makes every lifetime explicit', () => {
    expect(OPERATIONS.lifetime.output).toContain('Singleton');
    expect(OPERATIONS.lifetime.output).toContain('Scoped');
    expect(OPERATIONS.lifetime.output).toContain('Transient');
  });

  it('binds abstractions to implementations rather than concrete types', () => {
    expect(OPERATIONS.register.command).toMatch(/<I\w+, \w+>/);
    expect(OPERATIONS.register.effect).toMatch(/interface/i);
  });

  it('adds cross-cutting behaviour through a decorator', () => {
    expect(OPERATIONS.decorator.command).toContain('Decorate');
    expect(OPERATIONS.decorator.output).toContain('OrderService');
  });

  it('rejects a captive dependency at start-up', () => {
    expect(OPERATIONS.validate.command).toContain('ValidateOnBuild');
    expect(OPERATIONS.validate.output).toContain('FAIL FAST');
    expect(OPERATIONS.validate.effect).toMatch(/captive/i);
  });

  it('switches the shown registration when another operation is selected', () => {
    document.body.innerHTML = `
      <section id="di-workflow" data-operation="register">
        <div class="task-buttons"><button data-op="register" class="active">Register services</button><button data-op="validate">Validate</button></div>
        <div class="command-result">
          <code data-testid="di-command"></code>
          <p data-testid="di-effect"></p>
          <pre data-testid="di-output"></pre>
        </div>
      </section>`;

    const root = document.getElementById('di-workflow') as HTMLElement;
    selectOperation(root, 'validate');

    expect(root.querySelector('[data-testid="di-command"]')?.textContent).toContain('ValidateOnBuild');
    expect(root.getAttribute('data-operation')).toBe('validate');
    expect(root.querySelector('[data-op="validate"]')?.classList.contains('active')).toBe(true);
  });
});
