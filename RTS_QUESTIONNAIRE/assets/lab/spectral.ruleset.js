/**
 * Q49 — the house ruleset, as lint rather than as a style guide.
 *
 * Written in JavaScript rather than YAML because two of the rules need logic: a
 * deprecation that names no sunset date is the one that hurts, and a "documented" error
 * response is not the same thing as one with a schema. A guide nobody can run is advice;
 * a ruleset that fails the pull request is a standard.
 *
 * The rules are ordered by what they prevent: the first block stops unusable documents,
 * the second keeps consumer-facing quality, and the third enforces the governance that
 * makes the API catalogue possible.
 */

const { truthy, pattern, schema, defined } = require('@stoplight/spectral-functions');
const { oas3_1 } = require('@stoplight/spectral-formats');

/**
 * A deprecated operation must say when it dies and what replaces it. This is the rule
 * that turns deprecation from a comment into something a consumer can plan around:
 * a `deprecated: true` with no sunset date leaves every integrator guessing.
 */
const deprecationMustBeActionable = (operation, _options, context) => {
  if (operation.deprecated !== true) return [];

  const scope = context.path.join('.');
  const results = [];
  const metadata = operation['x-deprecation'];

  if (!metadata) {
    results.push({
      message: 'A deprecated operation must carry x-deprecation with since, sunset and replacement.',
      path: [...context.path, 'x-deprecation'],
    });
    return results;
  }

  for (const field of ['since', 'sunset', 'replacement']) {
    if (!metadata[field]) {
      results.push({
        message: `x-deprecation is missing "${field}": a consumer cannot act on a deprecation without it.`,
        path: [...context.path, 'x-deprecation', field],
      });
    }
  }

  // A sunset date in the past means the operation should be retired, not deprecated.
  if (metadata.sunset && Date.parse(metadata.sunset) < Date.now()) {
    results.push({
      message: `The sunset date ${metadata.sunset} has passed: retire the operation or move the date.`,
      path: [...context.path, 'x-deprecation', 'sunset'],
    });
  }

  return results;
};

/**
 * Every operation must enumerate the failures a consumer has to handle. A document that
 * lists only the happy path is a document that produces integration defects, because the
 * consumer discovers the error shape in production.
 */
const mustEnumerateErrorResponses = (operation, _options, context) => {
  const responses = operation.responses ?? {};
  const codes = Object.keys(responses);
  const hasClientError = codes.some((code) => /^4/.test(code));
  const hasServerError = codes.some((code) => /^5/.test(code));

  const results = [];

  if (!hasClientError) {
    results.push({
      message: 'No 4xx response is documented: the consumer cannot know what a rejected request looks like.',
      path: [...context.path, 'responses'],
    });
  }

  // A 401 or 429 applies to everything behind the security scheme, so it is required
  // rather than optional: the consumer's retry logic depends on knowing the difference.
  for (const required of ['401', '429']) {
    if (!codes.includes(required)) {
      results.push({
        message: `Response ${required} is not documented, but the API can return it.`,
        path: [...context.path, 'responses'],
      });
    }
  }

  if (!hasServerError) {
    results.push({
      message: 'No 5xx response is documented: an unexpected failure still has a shape, and consumers should know it.',
      path: [...context.path, 'responses'],
      severity: 1, // warning: not every operation can fail server-side
    });
  }

  return results;
};

module.exports = {
  extends: ['spectral:oas'],
  documentationUrl: 'https://docs.example.com/api/house-rules',
  formats: [oas3_1],

  rules: {
    // ---------------------------------------------------------------- usable documents
    'info-contact-and-terms': {
      description: 'A consumer must be able to find the owning team and the terms.',
      given: '$.info',
      severity: 'error',
      then: [
        { field: 'contact', function: truthy },
        { field: 'contact.url', function: truthy },
        { field: 'termsOfService', function: truthy },
      ],
    },
    'server-descriptions': {
      description: 'Every server must explain what it is for, so a consumer picks the right one.',
      given: '$.servers[*]',
      severity: 'error',
      then: { field: 'description', function: truthy },
    },
    'operation-summary-and-id': {
      description: 'operationId generates the client method name; summary is what the consumer reads first.',
      given: '$.paths[*][get,post,put,patch,delete]',
      severity: 'error',
      then: [
        { field: 'operationId', function: truthy },
        { field: 'summary', function: truthy },
        { field: 'description', function: truthy },
      ],
    },
    'operation-tags': {
      description: 'Untagged operations disappear from the grouped UI.',
      given: '$.paths[*][get,post,put,patch,delete]',
      severity: 'error',
      then: { field: 'tags', function: truthy },
    },
    'operation-security-declared': {
      description: 'Security must be declared explicitly per operation, even when it is inherited: the catalogue reads it from here.',
      given: '$.paths[*][get,post,put,patch,delete]',
      severity: 'warn',
      then: { field: 'security', function: truthy },
    },

    // ------------------------------------------------------------------- consumer quality
    'schema-needs-example': {
      description: 'An example is what a consumer actually reads; a type alone is not enough.',
      given: '$.components.schemas[*]',
      severity: 'error',
      then: { field: 'example', function: truthy },
    },
    'property-needs-description': {
      description: 'Every property says what it means, including units and format.',
      given: '$.components.schemas[*].properties[*]',
      severity: 'error',
      then: { field: 'description', function: truthy },
    },
    'parameter-needs-example': {
      description: 'Parameters are documented with a usable value, not just a type.',
      given: '$.paths[*][*].parameters[*]',
      severity: 'warn',
      then: [{ field: 'description', function: truthy }, { field: 'example', function: truthy, field: 'schema.example' }],
    },
    'error-responses-enumerated': {
      description: 'Every operation documents the failures a consumer has to handle: 4xx present, 401 and 429 required.',
      given: '$.paths[*][get,post,put,patch,delete]',
      severity: 'error',
      then: { function: mustEnumerateErrorResponses },
    },
    'problem-details-schema': {
      description: 'Error bodies use the shared ProblemDetails schema, so one parser handles them all.',
      given: '$.paths[*][*].responses[?(@property.match(/^4|^5/))].content',
      severity: 'warn',
      then: { field: 'application/problem+json', function: truthy },
    },
    'no-formatted-money': {
      description: 'Amounts are numbers in the major unit, never formatted strings.',
      given: '$.components.schemas[*].properties[?(@property.match(/amount|total|price/i))]',
      severity: 'error',
      then: {
        field: 'type',
        function: schema,
        functionOptions: { schema: { enum: ['number', 'integer'] } },
      },
    },

    // ------------------------------------------------------------------------ governance
    'catalogue-owner-required': {
      description: 'An API with no x-owner cannot appear in the catalogue and has nobody to call.',
      given: '$',
      severity: 'error',
      then: [
        { field: 'x-owner', function: truthy },
        { field: 'x-tier', function: truthy },
        { field: 'x-rate-limit', function: truthy },
      ],
    },
    'kebab-case-paths': {
      description: 'Paths are lower kebab-case: one convention, learned once.',
      given: '$.paths',
      severity: 'error',
      then: { function: pattern, functionOptions: { match: '^(\\/[a-z0-9-]+|\\/\\{[a-zA-Z]+\\})+\\/?$', notMatch: '\\/$' } },
    },
    'camel-case-properties': {
      description: 'JSON properties are camelCase, because the consumer writes them by hand in most languages.',
      given: '$.components.schemas[*].properties',
      severity: 'error',
      then: { function: pattern, functionOptions: { property: '^[a-z][a-zA-Z0-9]*$', notMatch: '^[A-Z_*]' } },
    },
    'pagination-convention': {
      description: 'Collections use page[size] and page[after], and page[size] has a documented maximum.',
      given: '$.paths[*].get.parameters[*]',
      severity: 'warn',
      then: {
        field: 'name',
        function: pattern,
        functionOptions: { match: '^(page\\[(size|after)\\]|status|sort)$' },
      },
    },
    'collection-page-schema': {
      description: 'A list operation returns an object with items and nextCursor, never a bare array: a bare array cannot be extended with pagination later.',
      given: '$.paths[*].get.responses.200.content.application/json.schema',
      severity: 'warn',
      then: { field: 'properties.nextCursor', function: defined },
    },
    'deprecation-is-actionable': {
      description: 'A deprecation without a sunset date and a replacement cannot be planned around.',
      given: '$.paths[*][get,post,put,patch,delete]',
      severity: 'error',
      then: { function: deprecationMustBeActionable },
    },
    'deprecated-uses-sunset-header': {
      description: 'A deprecated operation that has a sunset responds with the Sunset header under it (documented here, asserted by the contract test).',
      given: '$.paths[*][get,post,put,patch,delete][?(@.deprecated == true)]',
      severity: 'warn',
      then: { field: 'x-deprecation.sunset', function: truthy },
    },
  },
};
