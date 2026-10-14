/**
 * Q27 — the four architectural layers expressed as data.
 *
 * The point of this file is that the layering stops being a convention drawn on
 * a whiteboard: the responsibilities and the dependency rule are declared once
 * and the type system refuses a call that travels outward. A review comment can
 * be ignored; a compile error cannot.
 */

export type LayerName = 'api' | 'application' | 'domain' | 'infrastructure';

export interface LayerDefinition {
  /** Canonical name I use for the layer. */
  readonly name: LayerName;
  /** The other name the same layer is known by, so the list matches the request. */
  readonly alsoKnownAs: string;
  /** One-line responsibility, used in reviews and in the ADR. */
  readonly responsibility: string;
  /** What may live inside the layer. */
  readonly owns: readonly string[];
  /** What must never appear inside it. */
  readonly forbidden: readonly string[];
  /** The only layers this one is allowed to reference. */
  readonly mayDependOn: readonly LayerName[];
}

export const LAYERS = [
  {
    name: 'api',
    alsoKnownAs: 'Presentation',
    responsibility: 'Translate transport into a use case and a use case result into transport.',
    owns: ['endpoints/controllers', 'request and response DTOs', 'model validation', 'authn/authz filters',
           'problem details', 'versioning', 'rate limiting', 'OpenAPI description'],
    forbidden: ['business rules', 'direct database access', 'persistence entities in the contract'],
    mayDependOn: ['application'],
  },
  {
    name: 'application',
    alsoKnownAs: 'Business',
    responsibility: 'Orchestrate one use case per operation, transactionally.',
    owns: ['command/query handlers', 'ports (interfaces) for persistence, clock, bus', 'mapping', 'idempotency', 'authorisation decisions'],
    forbidden: ['EF Core, Spring Data, SQLAlchemy or HTTP client types', 'domain invariants re-implemented'],
    mayDependOn: ['domain'],
  },
  {
    name: 'domain',
    alsoKnownAs: 'Core',
    responsibility: 'Own the rules so they cannot be bypassed.',
    owns: ['entities', 'aggregates and value objects', 'domain services and specifications', 'domain events', 'invariants'],
    forbidden: ['any framework or infrastructure package', 'serialisation attributes', 'I/O of any kind'],
    mayDependOn: [],
  },
  {
    name: 'infrastructure',
    alsoKnownAs: 'Data Access',
    responsibility: 'Implement the ports and own every technology decision.',
    owns: ['repositories and gateways', 'ORM configuration and migrations', 'messaging', 'object storage', 'external HTTP clients', 'the composition root'],
    forbidden: ['being referenced by domain or application code', 'business rules'],
    mayDependOn: ['application', 'domain'],
  },
] as const satisfies readonly LayerDefinition[];

export type LayerCatalog = typeof LAYERS;

/* -------------------------------------------------------------------------- */
/* The dependency rule, enforced by the compiler                              */
/* -------------------------------------------------------------------------- */

/** The layers `From` is allowed to call, derived from the catalog above. */
export type AllowedDependency<From extends LayerName> =
  Extract<LayerCatalog[number], { name: From }>['mayDependOn'][number];

/** A call that the type system accepts. `to` is narrowed to the legal targets. */
export interface LayerCall<From extends LayerName> {
  readonly from: From;
  readonly to: AllowedDependency<From>;
  readonly reason: string;
}

export function call<From extends LayerName>(call_: LayerCall<From>): LayerCall<From> {
  return call_;
}

// Accepted: the API layer is allowed to reach the application layer.
call({ from: 'api', to: 'application', reason: 'endpoint delegates to the use case' });

// Rejected at compile time — uncomment to see the error:
// call({ from: 'api', to: 'domain', reason: 'reach into the aggregate' });
//   Type '"domain"' is not assignable to type '"application"'.
// call({ from: 'application', to: 'infrastructure', reason: 'use the repository implementation' });
//   Type '"infrastructure"' is not assignable to type '"domain"'.

/* -------------------------------------------------------------------------- */
/* One request, traced through every layer                                    */
/* -------------------------------------------------------------------------- */

export interface TraceStep {
  readonly layer: LayerName;
  /** What this layer contributes to the request. */
  readonly does: string;
  /** How long the layer is allowed to hold the request. */
  readonly budgetMs: number;
}

export const CONFIRM_ORDER_TRACE: readonly TraceStep[] = [
  { layer: 'api',            does: 'bind body, validate [Required]/[Range], authenticate caller, map to ConfirmOrderCommand', budgetMs: 2 },
  { layer: 'application',    does: 'load the aggregate through IOrderRepository, call Confirm, save through IUnitOfWork',      budgetMs: 1 },
  { layer: 'domain',         does: 'Order.Confirm: reject an empty order or a closed order, raise OrderConfirmed',              budgetMs: 0 },
  { layer: 'infrastructure', does: 'SELECT the aggregate with its lines, UPDATE status, INSERT the outbox row',                budgetMs: 0 },
];

/** Every trace must visit each layer at most once and always in this order. */
export const LAYER_ORDER: readonly LayerName[] = ['api', 'application', 'domain', 'infrastructure'];

export function isValidTrace(trace: readonly TraceStep[]): boolean {
  const positions = trace.map((step) => LAYER_ORDER.indexOf(step.layer));
  const strictlyIncreasing = positions.every((position, index) => index === 0 || position > positions[index - 1]);
  const noDuplicates = new Set(trace.map((step) => step.layer)).size === trace.length;

  return strictlyIncreasing && noDuplicates && trace.length === LAYER_ORDER.length;
}

if (!isValidTrace(CONFIRM_ORDER_TRACE)) {
  throw new Error('A layer was skipped, repeated or entered out of order.');
}
