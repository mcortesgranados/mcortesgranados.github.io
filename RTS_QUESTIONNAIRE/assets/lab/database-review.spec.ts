import { OPERATIONS, selectOperation } from './sql-workflow';

/**
 * Contract tests for the Q09 relational-database proof.
 * They assert the rules the answer claims: predicates stay sargable, every hot
 * query is reviewed against a plan, and indexes are designed for the query shape.
 */
describe('sql-workflow', () => {
  it('publishes a statement, an effect and an observable result per operation', () => {
    Object.values(OPERATIONS).forEach((operation) => {
      expect(operation.command.length).toBeGreaterThan(0);
      expect(operation.effect.length).toBeGreaterThan(0);
      expect(operation.output.length).toBeGreaterThan(0);
    });
  });

  it('keeps predicates sargable so the optimiser can seek', () => {
    expect(OPERATIONS.select.effect).toMatch(/sargable/i);
    expect(OPERATIONS.select.output).toContain('Index Seek');
  });

  it('proves the improvement with reads and timing, not with an opinion', () => {
    expect(OPERATIONS.plan.output).toMatch(/logical reads [\d,]+ \u2192 [\d,]+/);
    expect(OPERATIONS.plan.command).toContain('STATISTICS');
  });

  it('designs the index for the predicate order and covers the read columns', () => {
    expect(OPERATIONS.index.command).toContain('INCLUDE');
    expect(OPERATIONS.index.output).toContain('key lookup eliminated');
  });

  it('ties join strategy to refreshed cardinality estimates', () => {
    expect(OPERATIONS.stats.command).toContain('UPDATE STATISTICS');
    expect(OPERATIONS.stats.output).toMatch(/nested loops/i);
  });

  it('chooses an isolation level so readers do not block writers', () => {
    expect(OPERATIONS.isolation.command).toContain('READ_COMMITTED_SNAPSHOT');
    expect(OPERATIONS.isolation.output).toMatch(/not blocked/);
  });

  it('switches the shown statement when another operation is selected', () => {
    document.body.innerHTML = `
      <section id="sql-workflow" data-operation="select">
        <div class="task-buttons"><button data-op="select" class="active">Sargable query</button><button data-op="index">Design the index</button></div>
        <div class="command-result">
          <code data-testid="sql-command"></code>
          <p data-testid="sql-effect"></p>
          <pre data-testid="sql-output"></pre>
        </div>
      </section>`;

    const root = document.getElementById('sql-workflow') as HTMLElement;
    selectOperation(root, 'index');

    expect(root.querySelector('[data-testid="sql-command"]')?.textContent).toContain('CREATE NONCLUSTERED INDEX');
    expect(root.getAttribute('data-operation')).toBe('index');
    expect(root.querySelector('[data-op="index"]')?.classList.contains('active')).toBe(true);
  });
});
