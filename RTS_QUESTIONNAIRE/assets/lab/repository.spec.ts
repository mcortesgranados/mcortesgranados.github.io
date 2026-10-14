import { OPERATIONS, selectOperation } from './orm-workflow';

/**
 * Contract tests for the Q06 data-access proof.
 * They assert the rules the answer claims: read paths stay untracked, Dapper is
 * reserved for shape-specific reads, and writes always go through the Unit of Work.
 */
describe('orm-workflow', () => {
  it('publishes a command, an effect and an observable result per operation', () => {
    Object.values(OPERATIONS).forEach((operation) => {
      expect(operation.command.length).toBeGreaterThan(0);
      expect(operation.effect.length).toBeGreaterThan(0);
      expect(operation.output.length).toBeGreaterThan(0);
    });
  });

  it('keeps the hot read path free of change tracking', () => {
    expect(OPERATIONS.compiled.command).toContain('AsNoTracking');
    expect(OPERATIONS.compiled.effect).toMatch(/tracking/i);
  });

  it('proves the N+1 fix with a before and after measurement', () => {
    expect(OPERATIONS['nplus1'].output).toMatch(/BEFORE[\s\S]*AFTER/);
    expect(OPERATIONS['nplus1'].command).toContain('AsSplitQuery');
  });

  it('reserves Dapper for result-set-shaped reads', () => {
    expect(OPERATIONS.dapper.command).toContain('QueryAsync');
    expect(OPERATIONS.dapper.output).toContain('multi-map');
  });

  it('commits every write through the Unit of Work', () => {
    expect(OPERATIONS.uow.command).toContain('SaveChangesAsync');
    expect(OPERATIONS.uow.output).toContain('COMMIT');
  });

  it('switches the generated SQL when another operation is selected', () => {
    document.body.innerHTML = `
      <section id="orm-workflow" data-operation="linq">
        <div class="task-buttons"><button data-op="linq" class="active">EF Core LINQ</button><button data-op="dapper">Dapper hot path</button></div>
        <div class="command-result">
          <code data-testid="orm-command"></code>
          <p data-testid="orm-effect"></p>
          <pre data-testid="orm-output"></pre>
        </div>
      </section>`;

    const root = document.getElementById('orm-workflow') as HTMLElement;
    selectOperation(root, 'dapper');

    expect(root.querySelector('[data-testid="orm-command"]')?.textContent).toContain('QueryAsync');
    expect(root.getAttribute('data-operation')).toBe('dapper');
    expect(root.querySelector('[data-op="dapper"]')?.classList.contains('active')).toBe(true);
  });
});
