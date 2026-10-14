import { memo, Suspense, useCallback, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { useOrders } from './use-orders';       // data fetching hook, suspense-ready
import { OrderRow } from './order-row';
import type { Order } from './types';

/**
 * React 19 function component: state lives in the hook, derivation in useMemo,
 * the row is memoised so a parent re-render does not cost a full list repaint,
 * and the risky subtree is wrapped in an error boundary instead of crashing
 * the whole screen.
 */
export function OrderList({ customerId, filter }: { customerId: string; filter: string }) {
  const { orders, isLoading, refetch } = useOrders(customerId);

  // Derived, never duplicated: the filtered list is computed from the source data.
  const visible = useMemo(
    () => orders.filter((order: Order) => order.status.toLowerCase().includes(filter.toLowerCase())),
    [orders, filter],
  );

  const total = useMemo(() => visible.reduce((sum, order) => sum + order.total, 0), [visible]);

  // Stable identity: without it every row re-renders on each parent render.
  const handleRetry = useCallback(() => void refetch(), [refetch]);

  if (isLoading) return <OrderListSkeleton rows={6} />;

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading">Orders ({visible.length})</h2>
      <p aria-live="polite">Total {total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>

      <ErrorBoundary fallback={<p role="alert">This panel could not be displayed.</p>} onReset={handleRetry}>
        <Suspense fallback={<OrderListSkeleton rows={3} />}>
          <ul className="order-list">
            {visible.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        </Suspense>
      </ErrorBoundary>

      {visible.length === 0 && <p>No orders match the current filter.</p>}
    </section>
  );
}

export const MemoOrderList = memo(OrderList);

function OrderListSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="order-list order-list--skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="skeleton-row" />
      ))}
    </ul>
  );
}
