/**
 * Q44 — the contract tests that make independent deployability real.
 *
 * Component: `microservices-workflow.js` (the architecture axes).
 *
 * "We deploy independently" is a claim. Consumer-driven contract tests are what turn
 * it into a fact: each consumer publishes what it expects from its providers, and the
 * provider verifies every consumer's expectations in its own pipeline. A provider can
 * then change anything it likes, as long as the contracts hold — and if a contract
 * would break, the failure happens in the provider's build rather than in production
 * two days later, in somebody else's service, at the moment the consumer happens to
 * call the changed endpoint.
 *
 * The second half of the file is the provider-side gate that is easy to forget:
 * verifying the contracts is not enough if the deployment puts the new version in
 * front of live traffic without watching the outcome.
 */

import { describe, it, expect } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { OrdersClient } from './generated/orders-client';
import { verifyPacts } from './harness/verify-pacts';   // project helper around the provider verifier
import { seed } from './harness/seed';                  // provider state fixtures

const { like, eachLike, integer, string, uuid, iso8601DateTimeWithMillis } = MatchersV3;

/**
 * The consumer's side. It states what it needs, not what the provider currently
 * returns — that distinction is the whole value: an expectation written from the
 * provider's current output proves nothing.
 */
const provider = new PactV3({
  consumer: 'search-api',
  provider: 'orders-api',
  dir: './pacts',
});

describe('search-api consumes orders-api', () => {
  it('reads one order by id', async () => {
    provider
      .given('an order 7f3c19e2 exists and is visible to the caller')
      .uponReceiving('a request for that order')
      .withRequest({
        method: 'GET',
        path: '/api/v2/orders/7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34',
        headers: { Accept: 'application/json', Authorization: like('Bearer token') },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: uuid('7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34'),
          status: string('confirmed'),
          total: like(129.9),
          createdAt: iso8601DateTimeWithMillis('2026-03-04T10:15:30.000Z'),
          lines: eachLike({ sku: string('ABC-1'), quantity: integer(2), unitPrice: like(19.9) }),
          // Deliberately NOT asserted: fields the consumer ignores. Asserting them
          // would forbid the provider from adding anything, which is the opposite of
          // what a backwards-compatible contract is for.
        },
      });

    await provider.executeTest(async (mock) => {
      const client = new OrdersClient({ baseUrl: mock.url, token: 'Bearer token' });
      const order = await client.getOrder('7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34');

      expect(order.status).toBe('confirmed');
      expect(order.lines.length).toBeGreaterThan(0);
    });
  });

  it('tolerates a field it does not know about', async () => {
    // The concrete test of the compatibility rule: the provider adds a field, the
    // consumer keeps working. Without this test, "additive changes are safe" is a
    // sentence in a document.
    const withExtraField = {
      id: '7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34',
      status: 'confirmed',
      total: 129.9,
      createdAt: '2026-03-04T10:15:30.000Z',
      lines: [{ sku: 'ABC-1', quantity: 2, unitPrice: 19.9 }],
      fulfilmentChannel: 'warehouse-eu',   // added by the provider after this consumer shipped
    };

    const client = new OrdersClient({ baseUrl: 'https://orders.example.com', token: 'Bearer token' });
    expect(() => client.parseOrder(withExtraField)).not.toThrow();
    expect(client.parseOrder(withExtraField).total).toBe(129.9);
  });
});

/**
 * The provider's side, run in the orders-api pipeline. Every consumer's pact is
 * verified before the image is promoted: if this fails, the release stops in the
 * provider's build and the consumer is never surprised.
 */
describe('orders-api satisfies its consumers', () => {
  const consumers = [
    { name: 'search-api', pacts: ['./pacts/search-api-orders-api.json'], stateHandlers: orderStates },
    { name: 'notifications-worker', pacts: ['./pacts/notifications-worker-orders-api.json'], stateHandlers: orderStates },
  ];

  for (const consumer of consumers) {
    it(`verifies ${consumer.name}`, async () => {
      const result = await verifyPacts({
        providerBaseUrl: 'http://orders-api:8080',
        provider: 'orders-api',
        pactUrls: consumer.pacts,
        stateHandlers: consumer.stateHandlers,
        publishVerificationResult: true,
        providerVersion: process.env.GIT_SHA,   // the verification is tied to a commit, not to "latest"
      });

      expect(result.failed).toBe(0);
    });
  }
});

/** The states the pacts refer to, expressed as data the provider can set up. */
const orderStates: Record<string, () => Promise<void>> = {
  'an order 7f3c19e2 exists and is visible to the caller': async () => {
    await seed.order({ id: '7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34', status: 'confirmed', tenant: 'acme' });
  },
  'the order belongs to another tenant': async () => {
    await seed.order({ id: '7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34', status: 'confirmed', tenant: 'other' });
  },
};

/**
 * The deployment gate. Contract verification proves the shapes agree; it says nothing
 * about behaviour under live traffic. The canary analysis is the second gate, and it
 * is what makes a rolling release safe without a person watching a dashboard.
 */
export const canaryGate = {
  steps: [
    { weight: 5, observe: '5 min' },
    { weight: 25, observe: '10 min' },
    { weight: 100, observe: '15 min' },
  ],
  automaticRollbackWhen: [
    'error rate on the canary exceeds the baseline by 1 percentage point',
    'p99 latency exceeds the baseline by 50%',
    'any consumer contract verification fails for the candidate image',
    'the SLO burn rate exceeds 2 over the observation window',
  ],
  requireManualApprovalWhen: ['the release changes a published contract version', 'the change touches the ledger'],
};
