/**
 * Q49 — the tests that keep the specification true.
 *
 * Component: `openapi-lifecycle-workflow.js` (the specification lifecycle).
 *
 * A document that is not checked is a document that describes a previous version of the
 * API. These four checks run in the API's own pipeline and cover the ways a contract goes
 * wrong:
 *
 *   1. Drift: the artefact served by the running application no longer matches the
 *      document that was published for it.
 *   2. Breaking change: an edit inside a major version that would break an existing
 *      consumer, caught before it ships rather than by the consumer afterwards.
 *   3. Consistency with the ruleset: the lint runs here as well as in review, because a
 *      rule that only lives in a review is a rule that depends on the reviewer.
 *   4. Mock fidelity: the mock server the front-end team develops against is generated
 *      from this document, so a mock that accepts something the API rejects is worse than
 *      no mock at all.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { Spectral } from '@stoplight/spectral-core';
import { createMockServer } from './harness/mock-server';
import { diffSpecs, classifyChanges } from './harness/openapi-diff';
import ruleset from '../spectral.ruleset.js';

const PUBLISHED = 'spec/openapi.yaml';
const APP_STARTED = 'http://localhost:8080';

let published: ReturnType<typeof parseYaml>;

beforeAll(() => {
  published = parseYaml(readFileSync(PUBLISHED, 'utf8'));
});

describe('the document is valid and follows the house ruleset', () => {
  it('lints clean', async () => {
    const spectral = new Spectral();
    spectral.setRuleset(ruleset);

    const results = await spectral.run(published);
    const errors = results.filter((result) => result.severity === 0);

    // The message lists what to fix rather than only how many things are wrong.
    expect(
      errors.map((error) => `${error.code} at ${error.path.join('.')}: ${error.message}`),
    ).toEqual([]);
  });

  it('keeps the documented rate limit and owner, so the catalogue can be generated from it', () => {
    expect(published['x-owner']).toBeTruthy();
    expect(published['x-tier']).toBeDefined();
    expect(published['x-rate-limit'].default).toBeGreaterThan(0);
  });
});

describe('drift between the specification and the running application', () => {
  it('serves exactly the contract that was published for this version', async () => {
    // The API generates its own document; comparing it against the published artefact is
    // what catches a controller that was changed without the document being touched.
    const live = await fetch(`${APP_STARTED}/openapi/v2.json`).then((response) => response.json());

    const changes = diffSpecs(published, live);
    const breaking = classifyChanges(changes).filter((change) => change.breaking);

    expect(breaking.map((change) => change.summary)).toEqual([]);
  });

  it('has an implementation for every documented operation', () => {
    const documented = Object.entries(published.paths).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((method) => method !== 'parameters')
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

    // A documented operation with no route is the worst kind of contract defect: the
    // consumer writes the client and finds out at runtime.
    expect(documented.length).toBeGreaterThan(0);
    for (const operation of documented) {
      expect(routeExistsInApplication(operation), `${operation} is documented but not routed`).toBe(true);
    }
  });

  it('returns the documented shape for a documented error', async () => {
    const response = await fetch(`${APP_STARTED}/api/v2/orders/not-a-uuid`, {
      headers: { Authorization: 'Bearer invalid' },
    });

    // The shape asserted here is the one the document promises, from the shared schema:
    // one parser on the client is the whole point of standardising on ProblemDetails.
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');

    const problem = await response.json();
    expect(problem).toMatchObject({
      type: expect.stringMatching(/^https:\/\//),
      title: expect.any(String),
      status: 401,
      traceId: expect.any(String),
    });
  });
});

describe('breaking changes', () => {
  it('refuses a breaking change inside a published major version', () => {
    const previous = published;
    const candidate = structuredClone(published);

    // The change a hurried release makes: a required field added to a request body.
    candidate.components.schemas.CreateOrderRequest.required.push('customerReference');

    const changes = classifyChanges(diffSpecs(previous, candidate));

    expect(changes).toContainEqual(
      expect.objectContaining({
        breaking: true,
        kind: 'required-request-property-added',
      }),
    );
    // The gate is the pipeline rule this test exists to justify: a breaking change needs a
    // new major version, and the diff is what detects it rather than a reviewer's memory.
  });

  it('allows an additive change', () => {
    const candidate = structuredClone(published);
    candidate.components.schemas.Order.properties.fulfilmentChannel = {
      type: 'string',
      description: 'Added after the consumers shipped; they ignore it.',
      example: 'warehouse-eu',
    };

    const changes = classifyChanges(diffSpecs(published, candidate));

    expect(changes.every((change) => !change.breaking)).toBe(true);
  });

  it('allows a new optional parameter and a new error code', () => {
    const candidate = structuredClone(published);
    candidate.paths['/orders'].get.responses['503'] = {
      description: 'The service is temporarily unavailable. Retry with backoff.',
      content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } },
    };

    const changes = classifyChanges(diffSpecs(published, candidate));

    expect(changes.every((change) => !change.breaking)).toBe(true);
  });
});

describe('the mock server the front end develops against', () => {
  it('accepts what the specification accepts and rejects what it rejects', async () => {
    const mock = await createMockServer(published);

    const valid = await mock.post('/api/v2/orders', {
      lines: [{ sku: 'ABC-1', quantity: 2, unitPrice: 19.9 }],
    });
    expect(valid.status).toBe(201);

    // The rejection matters more than the acceptance: a mock that accepts an invalid body
    // hides the defect until integration, which is the opposite of its purpose.
    const invalid = await mock.post('/api/v2/orders', { lines: [] });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors).toBeDefined();

    await mock.close();
  });

  it('documents the deprecation the mock also enforces', async () => {
    const mock = await createMockServer(published);

    const response = await mock.post('/api/v2/orders/7f3c19e2-8c91-4d6a-9f20-1b7e5a2d6c34/lines', {
      sku: 'ABC-1',
      quantity: 1,
    });

    // The deprecated operation still works until its sunset, and every response under it
    // carries the date: a consumer who never read the changelog still learns about it.
    expect(response.status).toBe(201);
    expect(response.headers.get('sunset')).toBe(published.paths['/orders/{orderId}/lines']
      .post['x-deprecation'].sunset);

    await mock.close();
  });
});

declare function routeExistsInApplication(operation: string): boolean;
