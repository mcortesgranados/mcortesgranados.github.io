#!/usr/bin/env node
/**
 * MCP server: read tools are open, the write tool requires confirmation, and
 * every tool declares a typed schema — so a model can only call what the
 * contract allows and each call is logged with its validated arguments.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { OrderService } from './order-service.js';

const orders = new OrderService();

const server = new McpServer({
  name: 'orders',
  version: '1.4.0',
  instructions: 'Read tools are safe to call. orders.confirm changes state and needs confirmation.',
});

/** Read tool: bounded output by schema, never an unbounded list. */
server.tool(
  'orders.search',
  'Find orders for a customer',
  {
    customerId: z.string().describe('Customer id from the CRM'),
    status: z.enum(['OPEN', 'CONFIRMED', 'SHIPPED', 'CLOSED']).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ customerId, status, limit }) => {
    const result = await orders.search({ customerId, status, limit });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

/** Write tool: guarded by an optimistic-concurrency check and a confirmation step. */
server.tool(
  'orders.confirm',
  'Confirm an order. This changes state and must be confirmed by the user before calling.',
  {
    orderId: z.string(),
    expectedVersion: z.number().int().nonnegative().describe('Version read by orders.search'),
  },
  async ({ orderId, expectedVersion }, extra) => {
    if (!extra.signal?.aborted) {
      const outcome = await orders.confirm({ orderId, expectedVersion });

      if (!outcome.ok) {
        // Domain failures come back as data, not as a transport error the model must guess at.
        return { isError: true, content: [{ type: 'text', text: `CONFLICT: ${outcome.message}` }] };
      }

      return { content: [{ type: 'text', text: `Order ${orderId} confirmed (version ${expectedVersion + 1}).` }] };
    }

    return { isError: true, content: [{ type: 'text', text: 'CANCELLED' }] };
  },
);

/** Resource: the data dictionary the model can read instead of guessing field names. */
server.resource('orders://schema', 'Orders data dictionary', async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(orders.schema(), null, 2) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('orders MCP server ready on stdio');
