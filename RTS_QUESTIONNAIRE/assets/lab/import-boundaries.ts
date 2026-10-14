/**
 * Q30 — the import matrix that makes the modular monolith modular.
 *
 * A boundary that only exists in a diagram is a boundary that disappears in the
 * next sprint, so the same rules that ADR-014 describes as the architecture are
 * expressed here as a lint configuration that fails the build. The matrix is
 * intentionally boring: features may depend on the shared kernel and on their own
 * API layer, never on another feature, and only a thin top-level shell may wire
 * features together.
 *
 * Same rules also run in CI for the Nx workspace, where project tags carry the
 * same meaning; see the `tags` in nx-monorepo.json.
 */

export type Layer = 'app' | 'feature' | 'ui' | 'data-access' | 'core' | 'shared';

/** The only allowed direction of dependency. Anything absent from this map is forbidden. */
export const ALLOWED_IMPORTS: Record<Layer, readonly Layer[]> = {
  // The shell composes features. It owns routing, layout and nothing else.
  app: ['feature', 'ui', 'core', 'shared'],
  // A feature may reach its own data access, shared UI and the core kernel.
  feature: ['data-access', 'ui', 'core', 'shared'],
  'data-access': ['core', 'shared'],
  ui: ['core', 'shared'],
  core: ['shared'],
  shared: [],
} satisfies Record<Layer, readonly Layer[]>;

/** Explicit feature-to-feature edges, if a product requirement genuinely needs one. */
export const FEATURE_EDGE_ALLOWLIST: readonly string[] = [
  // Empty on purpose. A cross-feature dependency is a design decision, and it
  // should appear here as a reviewed exception with the ADR that justifies it.
  // Example of how one would read: 'orders -> billing // ADR-041 invoice preview'
] as const;

export interface BoundaryViolation {
  readonly file: string;
  readonly rule: string;
  readonly reason: string;
}

/**
 * Evaluated per import inside the feature folders. Returns the violations a
 * developer sees in their editor and in the pull request check.
 */
export function checkImport(params: {
  fromFile: string;
  fromFeature: string;
  fromLayer: Layer;
  targetModule: string;
  targetLayer: Layer;
  targetFeature?: string;
}): BoundaryViolation | null {
  const { fromFile, fromFeature, fromLayer, targetModule, targetLayer, targetFeature } = params;

  // 1. The layer must be a legal target for the importing layer at all.
  if (!ALLOWED_IMPORTS[fromLayer].includes(targetLayer)) {
    return {
      file: fromFile,
      rule: 'layer-direction',
      reason: `Layer "${fromLayer}" may not import "${targetLayer}" (importing ${targetModule}).`,
    };
  }

  // 2. Two different features must not reach into each other.
  if (
    targetLayer === 'feature' &&
    targetFeature !== undefined &&
    targetFeature !== fromFeature &&
    !FEATURE_EDGE_ALLOWLIST.some((edge) => edge.startsWith(`${fromFeature} -> ${targetFeature}`))
  ) {
    return {
      file: fromFile,
      rule: 'no-cross-feature',
      reason: `Feature "${fromFeature}" may not import feature "${targetFeature}". ` +
        'Move the shared part into the shared kernel, or coordinate through an event or the API.',
    };
  }

  // 3. Deep imports bypass the public surface of a library and break its versioning.
  if (/\/src\/|\/internal\//.test(targetModule)) {
    return {
      file: fromFile,
      rule: 'no-deep-import',
      reason: `Import the public entry point of ${targetModule.split('/')[0]} instead of a file inside it.`,
    };
  }

  // 4. The kernel is deliberately small: importing the whole shared module pulls
  //    in unrelated code and hides which dependency was actually needed.
  if (targetLayer === 'shared' && /@acme\/shared\/?$/.test(targetModule)) {
    return {
      file: fromFile,
      rule: 'shared-kernel-is-explicit',
      reason: 'Import the specific module (@acme/shared/date, /acme/shared/result) rather than the barrel.',
    };
  }

  return null;
}

/** The ESLint shape of the same rules, for the flat config in the workspace root. */
export const eslintBoundaryRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { group: ['**/features/*/*'], message: 'Use the feature public API: @acme/orders, not a file inside it.' },
        { group: ['@acme/*/src/**'], message: 'Deep imports are blocked by the import matrix (rule: no-deep-import).' },
      ],
    },
  ],
  // Enforced by eslint-plugin-boundaries, using the tags declared in nx-monorepo.json.
  'boundaries/element-types': [
    'error',
    {
      default: 'disallow',
      rules: [
        { from: 'app', allow: ['feature', 'ui', 'core', 'shared'] },
        { from: 'feature', allow: ['data-access', 'ui', 'core', 'shared'] },
        { from: 'data-access', allow: ['core', 'shared'] },
        { from: 'ui', allow: ['core', 'shared'] },
        { from: 'core', allow: ['shared'] },
        { from: 'shared', allow: [] },
      ],
    },
  ],
} as const;
