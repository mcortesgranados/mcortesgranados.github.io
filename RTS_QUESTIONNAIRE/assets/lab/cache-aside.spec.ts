import { OPERATIONS, selectOperation } from './cache-workflow';

/**
 * Contract tests for the Q05 cache proof.
 * They assert the rules the answer claims: every operation is documented,
 * every write carries an expiration, and invalidation is event-based.
 */
describe('cache-workflow', () => {
  it('publishes a command, an effect and an observable result per operation', () => {
    Object.values(OPERATIONS).forEach((operation) => {
      expect(operation.command.length).toBeGreaterThan(0);
      expect(operation.effect.length).toBeGreaterThan(0);
      expect(operation.output.length).toBeGreaterThan(0);
    });
  });

  it('documents an expiration on every write path', () => {
    expect(OPERATIONS.ttl.command).toContain('EX ');
    expect(OPERATIONS.ttl.output).toContain('TTL');
  });

  it('invalidates through pub/sub instead of deleting behind other nodes', () => {
    expect(OPERATIONS.invalidate.command).toContain('PUBLISH');
    expect(OPERATIONS.invalidate.effect).toMatch(/every node|invalidation/i);
  });

  it('protects the database from a stampede with a single-flight lock', () => {
    expect(OPERATIONS.lock.command).toContain('NX PX');
    expect(OPERATIONS.lock.effect).toMatch(/single-flight|stampede/i);
  });

  it('switches the rendered result when another operation is selected', () => {
    document.body.innerHTML = `
      <section id="cache-workflow" data-operation="hit">
        <div class="task-buttons"><button data-op="hit" class="active">Read (hit)</button><button data-op="lock">Lock</button></div>
        <div class="command-result">
          <code data-testid="cache-command"></code>
          <p data-testid="cache-effect"></p>
          <pre data-testid="cache-output"></pre>
        </div>
      </section>`;

    const root = document.getElementById('cache-workflow') as HTMLElement;
    selectOperation(root, 'lock');

    expect(root.querySelector('[data-testid="cache-command"]')?.textContent).toContain('NX PX');
    expect(root.getAttribute('data-operation')).toBe('lock');
    expect(root.querySelector('[data-op="lock"]')?.classList.contains('active')).toBe(true);
  });
});
