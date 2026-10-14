import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, switchMap, throwError, timer } from 'rxjs';

import { AuthStore } from './auth.store';
import { Telemetry } from './telemetry';

/**
 * Cross-cutting HTTP behaviour as functional interceptors: attach the token,
 * recover once from an expired session, retry only what is safe to retry, and
 * stamp every request with a correlation id so a failure can be traced from the
 * browser to the API log.
 *
 * Order matters — the array is applied left to right: correlation → retry →
 * auth — so the correlation id exists before anything else runs.
 */

/** 1. Correlation: one id per user action, propagated to the API. */
export const correlationInterceptor: HttpInterceptorFn = (request, next) => {
  const telemetry = inject(Telemetry);
  const traced = request.clone({
    setHeaders: { 'x-correlation-id': telemetry.currentCorrelationId() },
  });

  return next(traced);
};

/** 2. Retry: only idempotent methods, only for transient statuses, with backoff. */
export const retryInterceptor: HttpInterceptorFn = (request, next) => {
  const retryable = request.method === 'GET' || request.method === 'HEAD';
  const transient = (error: unknown) =>
    error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);

  return next(request).pipe(
    retry({ count: 2, delay: (error, attempt) => (transient(error) ? timer(200 * 2 ** attempt) : throwError(() => error)) }),
  );
};

/** 3. Auth: attach the access token, and on a single 401 refresh and replay. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);

  const authorised = request.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken()}` } });

  return next(authorised).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || request.url.includes('/auth/refresh')) {
        return throwError(() => error);
      }

      // Refresh once, then replay the original request — the caller never sees the detour.
      return auth.refresh().pipe(
        switchMap(() => next(request.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken()}` } }))),
        catchError(() => {
          auth.signOutExpiredSession();
          return throwError(() => error);
        }),
      );
    }),
  );
};
