/**
 * Breakpoints shared by the layout and by the components that must change
 * behaviour, not only styling: navigation pattern, table versus card view,
 * and how many panels fit without a scroll.
 *
 * CSS handles appearance; this file handles the decisions that need logic.
 */

export const breakpoints = {
  mobile: 360,
  tablet: 601,
  laptop: 1025,
  desktop: 1600,
} as const;

export type DeviceClass = keyof typeof breakpoints;

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceClass: DeviceClass;
  readonly isTouch: boolean;
  readonly prefersReducedMotion: boolean;
}

/** Classify the current viewport, including the touch and motion preferences. */
export function describeViewport(win: Window = window): Viewport {
  const width = win.innerWidth;
  const isTouch = win.matchMedia('(hover: none) and (pointer: coarse)').matches;

  return {
    width,
    height: win.innerHeight,
    deviceClass: classify(width),
    isTouch,
    prefersReducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

export function classify(width: number): DeviceClass {
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.laptop) return 'laptop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'mobile';
}

/**
 * Subscribe to viewport changes, debounced: a resize fires dozens of events and
 * the layout only needs the settled value. Returns a disposer.
 */
export function onViewportChange(listener: (viewport: Viewport) => void, win: Window = window): () => void {
  let frame = 0;

  const handler = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => listener(describeViewport(win)));
  };

  win.addEventListener('resize', handler, { passive: true });
  win.matchMedia('(orientation: landscape)').addEventListener('change', handler);

  listener(describeViewport(win));

  return () => {
    cancelAnimationFrame(frame);
    win.removeEventListener('resize', handler);
  };
}

/** Cards instead of tables below the laptop breakpoint: never force a side-scroll. */
export function shouldRenderTable(viewport: Viewport): boolean {
  return viewport.width >= breakpoints.laptop;
}

/** Density follows the available height as well as the width. */
export function shouldUseCompactDensity(viewport: Viewport): boolean {
  return viewport.width >= breakpoints.laptop && viewport.height >= 800;
}
