/**
 * Typed API client: the failure path is part of the type, illegal states are
 * unrepresentable, and anything crossing a network boundary is validated before
 * the domain is allowed to trust it.
 *
 * JavaScript experience shows up here as well — the event loop, promise
 * semantics, cancellation and closure behaviour are all part of the design.
 */

/** Branded id: a CustomerId can never be passed where an OrderId is expected. */
export type CustomerId = string & { readonly __brand: 'CustomerId' };
export type OrderId = string & { readonly __brand: 'OrderId' };

/** Result instead of exceptions: the caller cannot forget the failure branch. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export type OrderStatus = 'OPEN' | 'CONFIRMED' | 'SHIPPED' | 'CLOSED';

export interface Order {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly status: OrderStatus;
  readonly total: number;
  readonly lines: readonly OrderLine[];
}

export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly schema: { safeParse: (input: unknown) => { success: boolean; data?: Order; error?: unknown } },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getOrder(id: OrderId, signal?: AbortSignal): Promise<Result<Order, 'NOT_FOUND' | 'TIMEOUT' | 'INVALID'>> {
    // Explicit timeout on top of the caller's signal: the request cannot hang forever.
    const timeout = AbortSignal.timeout(2000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/orders/${id}`, { signal: combined });

      if (response.status === 404) return { ok: false, error: 'NOT_FOUND' };
      if (!response.ok) return { ok: false, error: 'INVALID' };

      const parsed = this.schema.safeParse(await response.json());
      // Types are erased at runtime: the payload is only trusted after validation.
      return parsed.success ? { ok: true, value: parsed.data as Order } : { ok: false, error: 'INVALID' };
    } catch (error) {
      return { ok: false, error: error instanceof DOMException && error.name === 'TimeoutError' ? 'TIMEOUT' : 'INVALID' };
    }
  }
}

/** Exhaustive handling: adding a status breaks the build until it is handled. */
export function describeStatus(status: OrderStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Awaiting confirmation';
    case 'CONFIRMED':
      return 'Confirmed for fulfilment';
    case 'SHIPPED':
      return 'In transit';
    case 'CLOSED':
      return 'Closed';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

/** Reads one page at a time so memory stays flat on a large export. */
export async function* pages<T>(load: (cursor: string | null) => Promise<{ items: readonly T[]; next: string | null }>) {
  let cursor: string | null = null;

  do {
    const page = await load(cursor);
    yield page.items;
    cursor = page.next;
  } while (cursor !== null);
}
