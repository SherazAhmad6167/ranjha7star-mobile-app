import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type MikrotikUserType = 'router' | 'hotspot' | 'ppp';
export type MikrotikServer = 1 | 2;

export interface MikrotikError {
  message: string;
  isCors: boolean;
  status: number;
}

@Injectable({ providedIn: 'root' })
export class MikrotikService {
  // Proxy bases — server 1 (194.1002) and server 2 (195.9998)
  private readonly bases: Record<MikrotikServer, string> = {
    1: environment.mikrotikProxyUrl,
    2: environment.mikrotikProxyUrl2,
  };

  constructor(private http: HttpClient) {}

  // ── Public API ───────────────────────────────────────────────────────────────

  createUser(
    type: MikrotikUserType,
    name: string,
    password: string,
    groupOrProfile: string,
    server: MikrotikServer = 1,
  ): Observable<any> {
    switch (type) {
      case 'router':
        return this.createRouterUser(name, password, groupOrProfile || 'full', server);
      case 'hotspot':
        return this.createHotspotUser(name, password, groupOrProfile || 'default', server);
      case 'ppp':
        return this.createPppSecret(name, password, groupOrProfile || 'default', 'pppoe', server);
    }
  }

  createRouterUser(name: string, password: string, group = 'full', server: MikrotikServer = 1): Observable<any> {
    return this.put('/user', { name, password, group }, server);
  }

  createHotspotUser(name: string, password: string, profile = 'default', server: MikrotikServer = 1): Observable<any> {
    return this.put('/ip/hotspot/user', { name, password, profile }, server);
  }

  createPppSecret(
    name: string,
    password: string,
    profile = 'default',
    service = 'pppoe',
    server: MikrotikServer = 1,
    disabled = 'no',
  ): Observable<any> {
    return this.put('/ppp/secret', { name, password, profile, service, disabled }, server);
  }

  getPppSecrets(server: MikrotikServer = 1): Observable<any[]> {
    return this.get('/ppp/secret', server);
  }

  getPppProfiles(server: MikrotikServer = 1): Observable<any[]> {
    return this.get('/ppp/profile', server);
  }

  updatePppSecret(id: string, attrs: Record<string, string>, server: MikrotikServer = 1): Observable<any> {
    return this.patch('/ppp/secret', { id, ...attrs }, server);
  }

  deletePppSecret(id: string, server: MikrotikServer = 1): Observable<any> {
    return this.httpDelete('/ppp/secret', { id }, server);
  }

  bulkEnablePppSecrets(server: MikrotikServer = 1): Observable<{ updated: number; total: number }> {
    return this.post('/ppp/secret/bulk-enable', {}, server);
  }

  bulkDisablePppSecrets(server: MikrotikServer = 1): Observable<{ updated: number; total: number }> {
    return this.post('/ppp/secret/bulk-disable', {}, server);
  }

  getSystemResource(server: MikrotikServer = 1): Observable<any> {
    return this.get('/system/resource', server);
  }

  userExists(type: MikrotikUserType, name: string, server: MikrotikServer = 1): Observable<boolean> {
    return this.get(this.endpointFor(type), server).pipe(
      map((users: any[]) => users.some((u) => u.name === name)),
    );
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────────

  private base(server: MikrotikServer): string {
    return this.bases[server];
  }

  private get(path: string, server: MikrotikServer = 1): Observable<any> {
    return this.http
      .get(`${this.base(server)}${path}`)
      .pipe(catchError(this.mapError));
  }

  private put(path: string, body: object, server: MikrotikServer = 1): Observable<any> {
    return this.http
      .put(`${this.base(server)}${path}`, body)
      .pipe(catchError(this.mapError));
  }

  private patch(path: string, body: object, server: MikrotikServer = 1): Observable<any> {
    return this.http
      .patch(`${this.base(server)}${path}`, body)
      .pipe(catchError(this.mapError));
  }

  private post(path: string, body: object, server: MikrotikServer = 1): Observable<any> {
    return this.http
      .post(`${this.base(server)}${path}`, body)
      .pipe(catchError(this.mapError));
  }

  private httpDelete(path: string, body: object, server: MikrotikServer = 1): Observable<any> {
    return this.http
      .delete(`${this.base(server)}${path}`, { body })
      .pipe(catchError(this.mapError));
  }

  private mapError(err: HttpErrorResponse): Observable<never> {
    const isCors = err.status === 0;
    let message: string;

    if (isCors) {
      message =
        'Cannot reach the proxy server. Make sure the Node.js backend is running ' +
        '(cd backend && npm start) and accessible at the configured URL.';
    } else if (err.status === 400) {
      message = err.error?.detail || err.error?.message || 'Bad request';
    } else if (err.status === 401) {
      message = 'Authentication failed — check router credentials in backend/.env';
    } else if (err.status === 403) {
      message = 'Access denied — the router user lacks permission.';
    } else if (err.status === 409) {
      message = 'A user with this name already exists.';
    } else if (err.status === 503) {
      message = err.error?.message || 'Cannot connect to MikroTik router.';
    } else if (err.status === 504) {
      message = 'Connection to MikroTik timed out.';
    } else {
      message = err.error?.detail || err.error?.message || err.message || 'Unknown error';
      if (typeof message === 'string' && message.toLowerCase().includes('already')) {
        message = 'A user with this name already exists.';
      }
    }

    return throwError(() => ({ message, isCors, status: err.status } as MikrotikError));
  }

  private endpointFor(type: MikrotikUserType): string {
    switch (type) {
      case 'router':  return '/user';
      case 'hotspot': return '/ip/hotspot/user';
      case 'ppp':     return '/ppp/secret';
    }
  }
}
