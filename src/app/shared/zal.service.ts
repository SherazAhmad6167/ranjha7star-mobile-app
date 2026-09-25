import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ZalError {
  message: string;
  isCors: boolean;
  status: number;
}

export interface ZalSubscriberQuery {
  search?: string;
  limit?: number;
  offset?: number;
  area?: string;
  package_id?: number | string;
  subscriber_type?: string;
}

export interface ZalStats {
  total: number;
  active: number;
  disable: number;
  online: number;
  offline: number;
  totalExpired: number;
  [key: string]: any;
}

export interface ZalPage<T> {
  rows: T[];
  /** null when the endpoint returns a bare array with no count. */
  total: number | null;
  hasMore: boolean;
}

/** The panel silently caps page size at 100 however large a limit you send. */
export const ZAL_MAX_LIMIT = 100;

/**
 * ZalUltra ISP CRM.
 *
 * Every call goes through the Node proxy: the panel is served over plain HTTP,
 * which the browser refuses to load from an HTTPS page, and the panel password
 * must never reach the bundle.
 */
@Injectable({ providedIn: 'root' })
export class ZalService {
  private readonly base = environment.zalProxyUrl;

  constructor(private http: HttpClient) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Confirms the proxy can log in - useful before blaming the data. */
  health(): Observable<any> {
    return this.http.get(`${this.base}/health`).pipe(catchError(this.mapError));
  }

  getSubscribers(query: ZalSubscriberQuery = {}): Observable<ZalPage<any>> {
    const limit = Math.min(Number(query.limit) || ZAL_MAX_LIMIT, ZAL_MAX_LIMIT);
    return this.http
      .get(`${this.base}/subscribers`, { params: this.params({ ...query, limit }) })
      .pipe(map((res) => this.page(res, limit)), catchError(this.mapError));
  }

  getSubscriber(id: number | string): Observable<any> {
    return this.http
      .get(`${this.base}/subscribers/details`, { params: this.params({ id }) })
      .pipe(map((res: any) => res?.data ?? res), catchError(this.mapError));
  }

  getPackages(): Observable<any[]> {
    return this.http
      .get(`${this.base}/packages`)
      .pipe(map((res) => this.page(res).rows), catchError(this.mapError));
  }

  /** Branch-wide counts - the only place a real total exists. */
  getStats(): Observable<ZalStats> {
    return this.http
      .get(`${this.base}/stats`)
      .pipe(map((res: any) => res?.data?.data ?? res?.data ?? res), catchError(this.mapError));
  }

  getAreas(): Observable<any[]> {
    return this.http
      .get(`${this.base}/areas`)
      .pipe(map((res) => this.page(res).rows), catchError(this.mapError));
  }

  createSubscriber(payload: Record<string, any>): Observable<any> {
    return this.http
      .post(`${this.base}/subscribers/create`, this.clean(payload))
      .pipe(catchError(this.mapError));
  }

  updateSubscriber(id: number | string, payload: Record<string, any>): Observable<any> {
    return this.http
      .put(`${this.base}/subscribers/update`, { ...this.clean(payload), id })
      .pipe(catchError(this.mapError));
  }

  deleteSubscriber(id: number | string): Observable<any> {
    return this.http
      .delete(`${this.base}/subscribers/delete`, { params: this.params({ id }) })
      .pipe(catchError(this.mapError));
  }

  /** Renew or recharge. Pass preview_only: 1 to price it without charging. */
  activate(payload: Record<string, any>): Observable<any> {
    return this.http
      .post(`${this.base}/subscribers/activation`, this.clean(payload))
      .pipe(catchError(this.mapError));
  }

  /** Panel users - the pool the salesperson dropdown draws from. */
  getUsers(): Observable<any[]> {
    return this.http
      .get(`${this.base}/users`)
      .pipe(map((res) => this.page(res).rows), catchError(this.mapError));
  }

  getNas(): Observable<any[]> {
    return this.http
      .get(`${this.base}/nas`)
      .pipe(map((res) => this.page(res).rows), catchError(this.mapError));
  }

  enableNet(subscriberId: number | string): Observable<any> {
    return this.http
      .post(`${this.base}/subscribers/enable-net`, { subscriber_id: subscriberId })
      .pipe(catchError(this.mapError));
  }

  disableNet(subscriberId: number | string): Observable<any> {
    return this.http
      .post(`${this.base}/subscribers/disable-net`, { subscriber_id: subscriberId })
      .pipe(catchError(this.mapError));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Blank fields must not be sent - the panel validates them as supplied. */
  private clean(payload: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null && value !== '') out[key] = value;
    }
    return out;
  }

  private params(query: Record<string, any>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  /**
   * ZalUltra's list envelope is not documented, and Laravel APIs wrap rows a
   * few different ways - accept whichever shape comes back.
   */
  private page(res: any, limit = 0): ZalPage<any> {
    // Documented shape is { success, data: { subscribers: [...], total } }, but
    // other resources nest differently - take whichever array turns up first.
    const rows =
      (Array.isArray(res) && res) ||
      (Array.isArray(res?.data) && res.data) ||
      (Array.isArray(res?.data?.subscribers) && res.data.subscribers) ||
      (Array.isArray(res?.data?.packages) && res.data.packages) ||
      (Array.isArray(res?.data?.areas) && res.data.areas) ||
      (Array.isArray(res?.data?.nas) && res.data.nas) ||
      (Array.isArray(res?.data?.users) && res.data.users) ||
      (Array.isArray(res?.data?.data) && res.data.data) ||
      (Array.isArray(res?.subscribers) && res.subscribers) ||
      (Array.isArray(res?.result) && res.result) ||
      this.firstArray(res?.data) ||
      [];

    // Subscribers come back as a bare array with no count, so a full page is
    // the only signal that more exist.
    const raw = res?.total ?? res?.data?.total ?? res?.meta?.total ?? res?.count;
    const total = raw === undefined || raw === null ? null : Number(raw);

    return {
      rows,
      total: total !== null && !isNaN(total) ? total : null,
      // A full page is the only hint that more rows exist when there is no count.
      hasMore: limit > 0 && rows.length >= limit,
    };
  }

  /** Last resort: the payload object holds exactly one array, use it. */
  private firstArray(payload: any): any[] | null {
    if (!payload || typeof payload !== 'object') return null;
    const arrays = Object.values(payload).filter((v) => Array.isArray(v)) as any[][];
    return arrays.length === 1 ? arrays[0] : null;
  }

  private mapError(err: HttpErrorResponse): Observable<never> {
    // With the Angular service worker active, a request that never got through
    // (CORS rejection, offline) comes back as an empty 504 instead of status 0.
    const isCors = err.status === 0 || (err.status === 504 && !err.error);
    let message: string;

    if (isCors) {
      message =
        'Cannot reach the proxy server. Make sure the Node.js backend is running ' +
        '(cd backend && npm start) and that this origin is in ALLOWED_ORIGINS.';
    } else if (err.status === 401) {
      message = 'ZalUltra rejected the proxy credentials — check ZAL_USER / ZAL_PASS.';
    } else if (err.status === 403) {
      message = 'Access denied — the ZalUltra account lacks permission for this endpoint.';
    } else if (err.status === 404) {
      message = err.error?.message || 'Endpoint not found on the ZalUltra panel.';
    } else if (err.status === 422) {
      message = err.error?.message || 'ZalUltra rejected the request parameters.';
    } else if (err.status === 503) {
      message = err.error?.message || 'Cannot connect to the ZalUltra panel.';
    } else if (err.status === 504) {
      message = err.error?.message || 'The ZalUltra panel timed out.';
    } else {
      message = err.error?.message || err.message || 'Unknown error';
    }

    return throwError(() => ({ message, isCors, status: err.status } as ZalError));
  }
}
