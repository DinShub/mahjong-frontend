import { HttpErrorResponse } from '@angular/common/http';
import type {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import type { Observable } from 'rxjs';

import { AUTH_ROUTES } from '@contracts/auth';

import { AuthService } from './auth.service';

/**
 * Routes that mint a session rather than spend one. They carry no bearer token, and a 401 from one
 * of them is the answer — retrying it after a refresh would either loop or resubmit a single-use
 * refresh token.
 */
const UNAUTHENTICATED_ROUTES: readonly string[] = [
  AUTH_ROUTES.guest,
  AUTH_ROUTES.login,
  AUTH_ROUTES.register,
  AUTH_ROUTES.refresh,
];

function isUnauthenticatedRoute(url: string): boolean {
  return UNAUTHENTICATED_ROUTES.some((route) => url.endsWith(route));
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Bearer token on the way out, one refresh-and-retry on a 401 on the way back.
 *
 * The retry is deliberately single-shot. `AuthService.refresh()` already collapses concurrent
 * callers into one rotation, so a burst of 401s costs one refresh; if the retried request is
 * *still* 401 the session is genuinely dead and the error belongs to the caller.
 */
export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);

  if (isUnauthenticatedRoute(request.url)) return next(request);

  const token = auth.accessToken();
  const authorized = token === null ? request : withToken(request, token);

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((session) => {
          if (session === null) return throwError(() => error);
          return next(withToken(request, session.accessToken));
        }),
      );
    }),
  );
};
