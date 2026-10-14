import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

/**
 * Responsive behaviour is a single observed source of truth. Styles stay in CSS;
 * this service answers only the questions that CSS cannot: which navigation
 * pattern to build, whether to render a table or cards, whether to virtualise a
 * list, and how much detail a chart may draw.
 *
 * The same shape is implemented with matchMedia in the React and Vue clients,
 * so the decision logic is portable even though the binding differs.
 */
@Injectable({ providedIn: 'root' })
export class AdaptiveShell {
  private readonly observer = inject(BreakpointObserver);

  private readonly match = toSignal(
    this.observer
      .observe([
        Breakpoints.XSmall, // < 600px
        Breakpoints.Small, // 600-959
        Breakpoints.Medium, // 960-1279
        Breakpoints.Large, // 1280-1919
        Breakpoints.XLarge, // 1920+
      ])
      .pipe(
        map((state) => ({
          compact: state.breakpoints[Breakpoints.XSmall],
          medium: state.breakpoints[Breakpoints.Medium],
          wide: state.breakpoints[Breakpoints.XLarge],
        })),
      ),
    { initialValue: { compact: false, medium: false, wide: false } },
  );

  /** Input type matters as much as width: a small touch screen is not a small mouse screen. */
  private readonly coarsePointer = signal(
    typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches,
  );

  readonly layout = computed(() => {
    const state = this.match();
    const coarse = this.coarsePointer();

    return {
      /** Navigation becomes a bottom bar only on a compact touch device. */
      navigation: state.compact && coarse ? 'bottom-bar' : state.compact ? 'drawer' : 'side-nav',
      /** Wide tables are replaced by cards before a horizontal scroll is ever allowed. */
      dataView: state.medium ? 'table' : 'cards',
      /** Virtual scrolling only pays off where long lists are actually visible. */
      virtualScroll: state.compact || state.medium,
      /** Fewer series on a narrow screen beats an unreadable chart. */
      chartSeries: state.wide ? 8 : state.medium ? 6 : 4,
      density: state.medium ? 'comfortable' : 'compact',
    } as const;
  });

  /** Serves the right asset size instead of scaling a desktop image down. */
  imageSources(src: string, widths = [480, 960, 1600]): { srcset: string; sizes: string } {
    return {
      srcset: widths.map((width) => `${src}?w=${width} ${width}w`).join(', '),
      sizes: '(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 800px',
    };
  }

  /** Emits the breakpoint name for telemetry, so regressions are visible per device class. */
  classify(): 'mobile' | 'tablet' | 'laptop' | 'desktop' {
    const state = this.match();
    if (state.wide) return 'desktop';
    if (state.medium) return 'laptop';
    if (state.compact) return 'mobile';
    return 'tablet';
  }
}
