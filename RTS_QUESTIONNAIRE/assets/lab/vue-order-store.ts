import { computed, reactive, readonly, ref, watchEffect } from 'vue';
import { defineStore } from 'pinia';

import { ApiClient } from './api-client';
import type { Order, OrderStatus } from './types';

/**
 * Vue 3 composition-API store: the same three ideas as the React version —
 * state, derived values and effects — expressed with the template-oriented
 * model. Computed values cache until a dependency changes, and the state is
 * exposed read-only so a component cannot mutate it by accident.
 */
export const useOrdersStore = defineStore('orders', () => {
  const orders = reactive<Order[]>([]);
  const status = ref<OrderStatus | 'ALL'>('ALL');
  const loading = ref(false);
  const error = ref<string | null>(null);

  const visible = computed(() =>
    status.value === 'ALL' ? orders : orders.filter((order) => order.status === status.value),
  );

  const total = computed(() => visible.value.reduce((sum, order) => sum + order.total, 0));

  async function load(customerId: string) {
    loading.value = true;
    error.value = null;

    try {
      orders.splice(0, orders.length, ...(await ApiClient.orders(customerId)));
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unknown error';
    } finally {
      loading.value = false;
    }
  }

  // Side effect kept explicit: refetch whenever the filter changes to a new value.
  watchEffect(() => {
    if (status.value !== 'ALL' && orders.length === 0) loading.value = true;
  });

  return { orders: readonly(orders), status, loading, error, visible, total, load };
});
