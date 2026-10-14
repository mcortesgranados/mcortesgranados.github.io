import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { OrderStore } from './order.store';
import { OrderRowComponent } from './order-row.component';

/**
 * A list that stays fast with tens of thousands of rows:
 *
 *   1. OnPush + signals — change detection runs only where state changed.
 *   2. computed — filtering and totals are derived and cached, never recomputed
 *      in the template.
 *   3. @for ... track — rows keep their identity, so an update re-uses DOM nodes.
 *   4. Virtual scroll — the DOM holds roughly one screen of rows, whatever the
 *      data size.
 *   5. @defer — the heavy aggregate panel is not even downloaded until visible.
 *
 * The template for this component is trimmed here to keep the file readable.
 */
@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [ScrollingModule, OrderRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cdk-virtual-scroll-viewport itemSize="64" class="viewport">
      @for (order of visible(); track order.id) {
        <app-order-row [order]="order" (selected)="select(order.id)" />
      } @empty {
        <p>No orders match the current filter.</p>
      }
    </cdk-virtual-scroll-viewport>

    @defer (on viewport) {
      <app-order-aggregates [lines]="lineCount()" />
    } @placeholder {
      <p>Aggregates load as you scroll.</p>
    }
  `,
})
export class OrderListComponent {
  private readonly store = inject(OrderStore);

  /** Inputs are signals: no ngOnChanges, no manual diffing. */
  readonly filter = input('');
  readonly selectedId = signal<string | null>(null);

  readonly orders = this.store.orders;

  // Derived state is cached until a dependency actually changes.
  readonly visible = computed(() => {
    const term = this.filter().toLowerCase();
    return term ? this.orders().filter((order) => order.status.toLowerCase().includes(term)) : this.orders();
  });

  readonly lineCount = computed(() => this.visible().reduce((total, order) => total + order.lines.length, 0));

  constructor() {
    // Long-lived streams are bound to the component lifetime: no manual unsubscribe.
    this.store
      .refreshOnFocus()
      .pipe(takeUntilDestroyed())
      .subscribe((patch) => this.store.patch(patch));

    // An effect is for side effects on state, not for deriving values.
    effect(() => {
      const id = this.selectedId();
      if (id) this.store.markViewed(id);
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
  }
}
