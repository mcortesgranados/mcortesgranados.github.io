import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { OrderDetailStore } from './features/orders/order-detail.store';

/**
 * Route configuration for a large application: every feature area is loaded on
 * demand, authorisation is decided before a component is created, data arrives
 * through a resolver so nothing renders empty, and the next likely route is
 * preloaded after the application becomes idle.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'orders' },

  {
    path: 'orders',
    canMatch: [roleGuard('orders.read')],                       // never even loads without the claim
    loadChildren: () => import('./features/orders/orders.routes').then((m) => m.ORDERS_ROUTES),
  },

  {
    path: 'orders/:id',
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],                       // refuses to discard an edited form
    resolve: { order: () => inject(OrderDetailStore).loadFromRoute() },   // data before first render
    loadComponent: () => import('./features/orders/order-detail.page').then((m) => m.OrderDetailPage),
  },

  {
    path: 'reports',
    canActivate: [authGuard],
    loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES),
    data: { preload: true },                                    // warm this one after idle
  },

  { path: 'forbidden', loadComponent: () => import('./core/pages/forbidden.page').then((m) => m.ForbiddenPage) },
  { path: '**', loadComponent: () => import('./core/pages/not-found.page').then((m) => m.NotFoundPage) },
];

export const appConfig = {
  providers: [provideRouter(routes, withPreloading(PreloadAllModules), withInMemoryScrolling({ scrollPositionRestoration: 'top' }))],
};
