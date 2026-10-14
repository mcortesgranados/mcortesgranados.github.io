import DataLoader from 'dataloader';
import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

/**
 * Resolvers stay thin: they read from a request-scoped context whose loaders
 * batch and cache, so a nested selection costs a fixed number of queries
 * instead of one per row. Depth and cost limits are wired into the same
 * validation pass that the allow-list runs in.
 */
export interface Context {
  readonly loaders: {
    ordersByCustomer: DataLoader<string, Order[]>;
    linesByOrder: DataLoader<string, OrderLine[]>;
  };
  readonly repositories: {
    orders: OrderRepository;
    lines: OrderLineRepository;
  };
}

export const validationRules = [
  depthLimit(10),
  createComplexityLimitRule(1000, { onCost: (cost: number) => cost >= 800 && warnSlowQuery(cost) }),
];

export const resolvers = {
  Query: {
    order: (_parent: unknown, args: { id: string }, ctx: Context) => ctx.repositories.orders.find(args.id),

    customer: (_parent: unknown, args: { id: string }, ctx: Context) => ctx.repositories.orders.customer(args.id),

    // Cursor pagination in the data layer, not in memory.
    orders: (
      _parent: unknown,
      args: { status?: string; first: number; after?: string },
      ctx: Context,
    ) => ctx.repositories.orders.page(args),
  },

  Order: {
    // Batching: N orders in one render produce one query, not N.
    lines: (order: { id: string }, _args: unknown, ctx: Context) => ctx.loaders.linesByOrder.load(order.id),

    total: async (order: { id: string; total?: string }, _args: unknown, ctx: Context) => {
      if (order.total) return order.total;
      const lines = await ctx.loaders.linesByOrder.load(order.id);
      return lines.reduce((sum, line) => sum + Number(line.total), 0);
    },
  },

  Mutation: {
    confirmOrder: async (
      _parent: unknown,
      args: { input: { orderId: string; expectedVersion: number } },
      ctx: Context,
    ) => {
      const result = await ctx.repositories.orders.confirm(args.input);

      // Domain failures travel as typed user errors, not as thrown exceptions.
      return result.ok
        ? { order: result.order, userErrors: [] }
        : { order: null, userErrors: [{ code: result.code, message: result.message, field: 'input.orderId' }] };
    },
  },
};

declare function warnSlowQuery(cost: number): boolean;
declare function createComplexityLimitRule(maxCost: number, options: object): unknown;
declare function depthLimit(limit: number): unknown;
