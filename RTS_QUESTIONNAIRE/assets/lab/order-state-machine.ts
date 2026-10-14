/**
 * Q42 — the order lifecycle as an explicit state machine.
 *
 * Component: `lld-workflow.js` (the behavioural design).
 *
 * A lifecycle described in prose produces an implementation with the rules scattered
 * across the callers: one service checks the status before updating, another forgets to,
 * and the third one invents a transition nobody agreed on. The transition table below is
 * the design: it is the single place where a legal move is defined, it refuses everything
 * else by omission, and the diagram is generated from it — so the picture in the design
 * document cannot drift away from the behaviour in the code.
 */

export type OrderState = 'draft' | 'open' | 'confirmed' | 'cancelled';
export type OrderEvent = 'OrderOpened' | 'OrderConfirmed' | 'OrderCancelled';

/** Context the guards need. Passed in rather than read from a global, so a test can vary it. */
export interface TransitionContext {
  /** Number of lines on the order. */
  readonly lineCount: number;
  /** Gross total, in the order currency. */
  readonly total: number;
  /** Whether the caller belongs to the same tenant as the order. */
  readonly sameTenant: boolean;
  /** Hours elapsed since the order was confirmed, when it is confirmed. */
  readonly hoursSinceConfirmation: number;
  /** Business rule: how long a confirmed order may still be cancelled. */
  readonly coolingOffHours: number;
}

export interface Transition {
  readonly from: OrderState;
  readonly on: OrderEvent;
  readonly to: OrderState;
  /** Named, so a refusal can say which rule it violated rather than "invalid state". */
  readonly guard: string;
  readonly allowed: (context: TransitionContext) => boolean;
}

/**
 * The transition table. Reading it should answer the reviewer's question — "what can
 * happen from each state?" — without following any code.
 */
export const TRANSITIONS: readonly Transition[] = [
  {
    from: 'draft',
    on: 'OrderOpened',
    to: 'open',
    guard: 'at least one line',
    allowed: (context) => context.lineCount > 0,
  },
  {
    from: 'open',
    on: 'OrderConfirmed',
    to: 'confirmed',
    guard: 'the caller owns the order and the total is positive',
    allowed: (context) => context.sameTenant && context.total > 0,
  },
  {
    from: 'open',
    on: 'OrderCancelled',
    to: 'cancelled',
    guard: 'the caller owns the order',
    allowed: (context) => context.sameTenant,
  },
  {
    from: 'confirmed',
    on: 'OrderCancelled',
    to: 'cancelled',
    guard: 'within the cooling-off window',
    allowed: (context) => context.sameTenant && context.hoursSinceConfirmation <= context.coolingOffHours,
  },
  // There is deliberately no transition out of `cancelled`: it is terminal, and the
  // absence of a row is the enforcement. A re-opened order is a new order, which keeps the
  // audit trail honest.
];

const TERMINAL_STATES: readonly OrderState[] = ['cancelled'];

export function isTerminal(state: OrderState): boolean {
  return TERMINAL_STATES.includes(state);
}

export type TransitionResult =
  | { readonly ok: true; readonly state: OrderState }
  | { readonly ok: false; readonly code: 'no-such-transition' | 'guard-refused'; readonly detail: string };

/**
 * The only way to move an order. Everything illegal is refused here, which is what makes
 * the rules impossible to bypass from a caller: there is no setter and no status update.
 */
export function transition(
  from: OrderState,
  on: OrderEvent,
  context: TransitionContext,
): TransitionResult {
  const candidate = TRANSITIONS.find((entry) => entry.from === from && entry.on === on);

  if (!candidate) {
    // The message names the state and the event, because this is the error a new developer
    // will hit first and it should teach rather than confuse.
    return {
      ok: false,
      code: 'no-such-transition',
      detail: `An order in state "${from}" has no "${on}" transition. Legal events from "${from}": ${
        legalEventsFrom(from).join(', ') || 'none (terminal state)'
      }.`,
    };
  }

  if (!candidate.allowed(context)) {
    return {
      ok: false,
      code: 'guard-refused',
      detail: `${on} was refused from "${from}": it requires ${candidate.guard}.`,
    };
  }

  return { ok: true, state: candidate.to };
}

export function legalEventsFrom(state: OrderState): readonly OrderEvent[] {
  return TRANSITIONS.filter((entry) => entry.from === state).map((entry) => entry.on);
}

/**
 * The diagram, generated from the table. A hand-drawn diagram is a second source of truth
 * for the same rules, and the two diverge the first time a transition is added in a hurry.
 */
export function toMermaid(): string {
  const lines = ['stateDiagram-v2'];

  for (const state of states()) {
    lines.push(`  ${state}${isTerminal(state) ? ' : terminal' : ''}`);
  }

  for (const entry of TRANSITIONS) {
    lines.push(`  ${entry.from} --> ${entry.to} : ${entry.on} [${entry.guard}]`);
  }

  return lines.join('\n');
}

function states(): readonly OrderState[] {
  const seen = new Set<OrderState>();
  for (const entry of TRANSITIONS) {
    seen.add(entry.from);
    seen.add(entry.to);
  }
  return [...seen];
}

/**
 * The invariant the whole thing exists to protect, asserted rather than assumed: from a
 * terminal state there is no way out, whatever event arrives.
 */
export function assertTerminalStatesAreFinal(): void {
  for (const state of TERMINAL_STATES) {
    const outgoing = TRANSITIONS.filter((entry) => entry.from === state);

    if (outgoing.length > 0) {
      throw new Error(
        `"${state}" is declared terminal but has outgoing transitions: ${outgoing.map((entry) => entry.on).join(', ')}.`,
      );
    }
  }
}

/**
 * The concurrency rule from the design document, made checkable. Two confirmations racing
 * is the case that decides whether the design is correct: the state machine is evaluated
 * against the loaded version, and the loser is refused by the row version at commit time
 * rather than by timing here.
 */
export function confirmIsIdempotentInEffect(currentState: OrderState): boolean {
  // Confirming an already confirmed order changes nothing and is reported as a conflict,
  // which is what makes a client retry safe.
  return currentState === 'confirmed';
}
