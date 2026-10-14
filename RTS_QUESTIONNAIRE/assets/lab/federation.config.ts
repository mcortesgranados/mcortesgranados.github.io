/**
 * Q29 — Module Federation configuration, host side and remote side.
 *
 * Component: `mfe-workflow.js` (the runtime composition logic).
 *
 * The two rules that make runtime federation survivable are enforced here rather
 * than documented in a wiki:
 *   1. Anything that must exist once — the framework, the reactivity library and
 *      the design system — is declared `singleton: true`, so a remote can never
 *      bring a second copy of Angular onto the page.
 *   2. The shared versions are negotiated at build time (`strictVersion`), so a
 *      mismatch fails the pipeline instead of failing in the browser for a user.
 *
 * A remote exposes only the modules listed in `exposes`. Everything else is a
 * private implementation detail of the team that owns it.
 */

import { ModuleFederationPlugin } from '@module-federation/enhanced/webpack';
import { remoteManifest } from './remote-manifest';   // resolveJsonModule: the manifest is data

export interface SharedPackage {
  readonly name: string;
  readonly singleton: true;
  readonly strictVersion: true;
  readonly requiredVersion?: string;
}

/**
 * One definition of the shared surface, used by the shell and by every remote, so
 * a vertical cannot quietly declare the design system as a private dependency and
 * end up shipping a second copy.
 */
export function sharedSingletons(names?: readonly string[]): SharedPackage[] {
  const all: SharedPackage[] = [
    { name: '@angular/core', singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    { name: '@angular/common', singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    { name: 'rxjs', singleton: true, strictVersion: true, requiredVersion: '^7.8.0' },
    { name: '@acme/design-system', singleton: true, strictVersion: true, requiredVersion: '^4.2.0' },
  ];

  return names ? all.filter((entry) => names.includes(entry.name)) : all;
}

/** The host (shell). It composes remotes; it also owns nothing vertical. */
export const shellConfig = {
  name: 'shell',
  filename: 'shell.js',

  remotes: {
    // Consumed at runtime: each entry resolves to the URL published by the
    // remote's own pipeline, so the shell is deployed independently of them.
    search: remoteManifest.remotes.search.entry,
    analytics: remoteManifest.remotes.analytics.entry,
    admin: remoteManifest.remotes.admin.entry,
  },

  shared: sharedSingletons(['@angular/core', '@angular/common', 'rxjs', '@acme/design-system']),

  // The shell consumes; it does not expose modules to be composed elsewhere.
  exposes: {},
};

/** One remote, published by the team that owns the vertical. */
export function remoteConfig(vertical: keyof typeof remoteManifest.remotes) {
  const definition = remoteManifest.remotes[vertical];

  return {
    name: vertical,
    // Every remote publishes its own entry: the file name encodes the vertical so
    // two remotes can never overwrite each other in the CDN bucket.
    filename: `${vertical}.remote.js`,

    // Exposed modules are the public contract of the vertical. The shell and the
    // other remotes may import only these, and they are versioned with the remote.
    exposes: Object.fromEntries(
      definition.exposes.map((modulePath) => [modulePath, modulePath]),
    ),

    // A remote that uses a shared singleton must declare it with the same
    // singleton flag, or the runtime instantiates a second copy.
    shared: sharedSingletons(definition.shared),

    // No `remotes` block: verticals do not call each other directly. Cross-team
    // communication goes through events or the API, never through an import.
    remotes: {},
  };
}

/**
 * Build-time guard. `strictVersion` turns a version skew into a build failure;
 * this function turns a manifest mistake into one too, before either reaches the
 * registry.
 */
export function assertFederationContract(): void {
  const shared: readonly SharedPackage[] = sharedSingletons();

  for (const [vertical, definition] of Object.entries(remoteManifest.remotes)) {
    const missing = definition.shared.filter(
      (pkg) => !shared.some((entry) => entry.name === pkg),
    );

    if (missing.length > 0) {
      throw new Error(
        `${vertical}: every shared dependency it uses must be declared as a singleton. Missing: ${missing.join(', ')}`,
      );
    }

    if (definition.exposes.length === 0) {
      throw new Error(`${vertical}: a remote with no exposed module cannot be composed.`);
    }

    // A vertical is deployable on its own only if it owns its pipeline.
    if (!definition.pipeline || !definition.owner) {
      throw new Error(`${vertical}: no owner or no pipeline — that remote is not independently deployable.`);
    }
  }
}
