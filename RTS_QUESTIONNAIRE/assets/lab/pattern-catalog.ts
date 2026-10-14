/**
 * Q33 — the pattern catalogue, as data rather than as a list in a document.
 *
 * Component: `solid-workflow.js` (the SOLID refactors, one per principle).
 *
 * The useful question about a design pattern is never "do you know it" but "where
 * did you apply it, and which principle was it serving". Keeping the catalogue in
 * this shape makes that answer checkable: every entry names the concrete place it
 * is used and the force it resolves, and a pattern that serves no entry here is not
 * in the codebase on purpose.
 */

export type SolidPrinciple = 'srp' | 'ocp' | 'lsp' | 'isp' | 'dip';

export type PatternCategory = 'creational' | 'structural' | 'behavioural' | 'architectural';

export interface PatternEntry {
  readonly name: string;
  readonly category: PatternCategory;
  /** The problem it resolves, in one line. */
  readonly intent: string;
  /** Where it is actually applied, so the claim can be checked. */
  readonly appliedIn: string;
  /** Which principle it serves here — a pattern used for its own sake is a smell. */
  readonly serves: readonly SolidPrinciple[];
  /** Stacks where the same vocabulary transfers. */
  readonly stacks: readonly ('dotnet' | 'java' | 'python' | 'typescript')[];
}

export const PATTERN_CATALOG: readonly PatternEntry[] = [
  {
    name: 'Strategy',
    category: 'behavioural',
    intent: 'Select an algorithm at runtime without adding a branch to the caller.',
    appliedIn: 'pricing by customer segment: GoldPricing, PartnerPricing, EmployeePricing behind IPricingStrategy',
    serves: ['ocp', 'srp'],
    stacks: ['dotnet', 'java', 'python'],
  },
  {
    name: 'Specification',
    category: 'behavioural',
    intent: 'Name a predicate so it can be reused, composed and translated to SQL.',
    appliedIn: 'ActiveOnPlan, AndSpecification — composed by handlers, translated by the repository',
    serves: ['srp', 'ocp'],
    stacks: ['dotnet', 'java'],
  },
  {
    name: 'Decorator',
    category: 'structural',
    intent: 'Add behaviour around an implementation without editing it or its callers.',
    appliedIn: 'CachingCustomerRepository and LoggingHandler wrapped around the port in the composition root',
    serves: ['ocp', 'srp'],
    stacks: ['dotnet', 'python'],
  },
  {
    name: 'Adapter',
    category: 'structural',
    intent: 'Convert one interface into the one the caller expects, keeping the foreign type outside.',
    appliedIn: 'SendGridNotifier and the payment gateway client, both behind ports owned by the application',
    serves: ['dip', 'srp'],
    stacks: ['dotnet', 'java', 'python'],
  },
  {
    name: 'Factory',
    category: 'creational',
    intent: 'Centralise the decision of which implementation to build.',
    appliedIn: 'PricingStrategyFactory resolving by segment, and the DI container as the general case',
    serves: ['ocp', 'dip'],
    stacks: ['dotnet', 'java'],
  },
  {
    name: 'Builder',
    category: 'creational',
    intent: 'Assemble a complex object step by step so the invariants hold at the end.',
    appliedIn: 'OrderBuilder in tests and the query builders that assemble filtered, paginated SQL',
    serves: ['srp'],
    stacks: ['dotnet', 'java', 'python'],
  },
  {
    name: 'Facade',
    category: 'structural',
    intent: 'Offer one simplified entry point over a group of collaborating classes.',
    appliedIn: 'the BFF aggregation layer, which turns four backend calls into one the SPA makes',
    serves: ['srp', 'isp'],
    stacks: ['typescript', 'dotnet'],
  },
  {
    name: 'Mediator',
    category: 'behavioural',
    intent: 'Keep colleagues from referring to each other by routing through one collaborator.',
    appliedIn: 'command and query handlers dispatched through a mediator instead of controller-to-service chains',
    serves: ['srp', 'isp', 'dip'],
    stacks: ['dotnet', 'java'],
  },
  {
    name: 'Observer / domain events',
    category: 'behavioural',
    intent: 'Notify interested parties of a change without the producer knowing who they are.',
    appliedIn: 'OrderConfirmed raised in the aggregate, published after the commit, consumed by billing and analytics',
    serves: ['ocp', 'dip'],
    stacks: ['dotnet', 'java', 'python'],
  },
  {
    name: 'Template method',
    category: 'behavioural',
    intent: 'Fix the sequence of an algorithm and let subclasses supply the steps.',
    appliedIn: 'the import pipeline: read, validate, map, persist — with the format-specific step overridden',
    serves: ['ocp', 'lsp'],
    stacks: ['dotnet', 'java'],
  },
  {
    name: 'Singleton',
    category: 'creational',
    intent: 'Guarantee one instance for a process-wide concern.',
    appliedIn: 'registered as a container singleton (clock, cache multiplexer) — never a static holder, which is untestable',
    serves: ['dip'],
    stacks: ['dotnet', 'java', 'python'],
  },
  {
    name: 'CQRS',
    category: 'architectural',
    intent: 'Separate the write model from the read model so each can be shaped for its job.',
    appliedIn: 'aggregate-based writes through repositories, Dapper projections for reporting screens',
    serves: ['srp', 'isp'],
    stacks: ['dotnet', 'java'],
  },
  {
    name: 'Saga / process manager',
    category: 'architectural',
    intent: 'Coordinate a long-running workflow across services with compensating actions.',
    appliedIn: 'order fulfilment spanning payment, stock and shipping, with an explicit compensation per step',
    serves: ['srp', 'dip'],
    stacks: ['dotnet', 'java'],
  },
];

/** Which principles the catalogue serves, so a gap is visible rather than assumed. */
export function coverageByPrinciple(): Record<SolidPrinciple, string[]> {
  const principles: SolidPrinciple[] = ['srp', 'ocp', 'lsp', 'isp', 'dip'];

  return Object.fromEntries(
    principles.map((principle) => [
      principle,
      PATTERN_CATALOG.filter((entry) => entry.serves.includes(principle)).map((entry) => entry.name),
    ]),
  ) as Record<SolidPrinciple, string[]>;
}

/**
 * LSP is deliberately thin. Substitution is a property of the contract rather than
 * a pattern, and the mechanism that keeps it true is the shared contract test suite
 * described in order-pricing.after.cs, not an entry in this list.
 */
export const LSP_ENFORCED_BY_TESTS = true;

/** A pattern applied for its own sake is a smell: every entry must name a place. */
export function assertEveryPatternIsApplied(): void {
  const unapplied = PATTERN_CATALOG.filter((entry) => entry.appliedIn.trim().length === 0);

  if (unapplied.length > 0) {
    throw new Error(
      `Patterns with no concrete application: ${unapplied.map((entry) => entry.name).join(', ')}`,
    );
  }
}
