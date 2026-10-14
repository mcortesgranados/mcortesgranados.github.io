/**
 * Q29 — the shell: route-based orchestration over independently deployed remotes.
 *
 * Component: `mfe-workflow.js` (the runtime composition logic).
 *
 * The shell is deliberately small, because everything it owns becomes a
 * cross-team dependency and a reason for the verticals to be released together.
 * What it owns is exactly the list in `sharedConcerns` below; what it does not own
 * is any vertical. A route activates a remote only when that route is reached, so
 * a user in the admin area never downloads the search bundle.
 */

import { registerApplication, start, type LifeCycles } from 'single-spa';
import { remoteManifest } from './remote-manifest';
import { EventBus } from './shared/event-bus';
import { AuthSession } from './shared/auth-session';
import { ErrorBoundary } from './shared/error-boundary';

/**
 * Concerns that must be identical for every remote, therefore they live in the
 * shell and are handed to the remotes as a single context object. The alternative
 * — each vertical solving auth and theming on its own — is what turns a
 * micro-frontend estate into four inconsistent applications.
 */
export const sharedConcerns = {
  auth: AuthSession,          // login, token refresh, logout, route protection
  theme: 'design-system/v4',  // tokens and dark mode resolved once
  events: EventBus,           // the only cross-team channel: custom events
  errors: ErrorBoundary,      // one boundary per remote, reported with its name
  analytics: 'acme/telemetry',// every vertical reports under a shared schema
} as const;

/** Everything a remote receives when it is mounted. Nothing else is shared. */
export interface MountContext {
  readonly basePath: string;
  readonly singletons: typeof sharedConcerns;
  /** The remote may not import another remote: it publishes and subscribes here instead. */
  readonly bus: InstanceType<typeof EventBus>;
}

/**
 * Registers one application per route from the manifest. The manifest is the
 * single source of truth: adding a vertical means publishing a remote and adding
 * an entry, not editing the shell's internals.
 */
export function bootstrapShell(options: { replaceWithEmptyShellOnFailure?: boolean } = {}): void {
  for (const [vertical, definition] of Object.entries(remoteManifest.remotes)) {
    registerApplication({
      name: vertical,
      // Loaded lazily: the import runs only when the route becomes active.
      app: () => import(/* webpackIgnore: true */ definition.entry),
      // The route pattern is declared by the vertical, not inferred by the shell.
      activeWhen: (location) => definition.routes.some((route) => location.pathname.startsWith(route)),

      customProps: {
        basePath: definition.basePath,
        singletons: sharedConcerns,
        bus: sharedConcerns.events,
      } satisfies MountContext,
    });
  }
}

/**
 * Failure containment. If a remote fails to load — a bad deploy, a CDN miss, a
 * version negotiation error — its route degrades to a shell-rendered message and
 * the rest of the application keeps working. One team's release cannot take the
 * whole product down.
 */
export function withRemoteFallback(
  vertical: string,
  lifecycle: LifeCycles,
  options: { replaceWithEmptyShellOnFailure?: boolean } = {},
): LifeCycles {
  const guard = (phase: keyof LifeCycles) => {
    const delegate = lifecycle[phase];
    if (typeof delegate !== 'function') return undefined;

    return async (props: MountContext) => {
      try {
        return await delegate(props);
      } catch (failure) {
        // Reported with the vertical name so on-call knows which team to page.
        sharedConcerns.errors.report(vertical, failure as Error);

        if (options.replaceWithEmptyShellOnFailure) {
          // The shell renders an empty state on the route instead of a blank page.
          return sharedConcerns.errors.renderFallback(vertical);
        }

        throw failure;
      }
    };
  };

  return {
    bootstrap: guard('bootstrap') as LifeCycles['bootstrap'],
    mount: guard('mount') as LifeCycles['mount'],
    unmount: guard('unmount') as LifeCycles['unmount'],
  };
}

start({ urlRerouteOnly: true });
