/**
 * ZalUltra ISP CRM REST client.
 *
 * Unlike RouterOS, ZalUltra speaks plain JSON over HTTP, so there is no wire
 * protocol to implement here - this only handles the two things the browser
 * cannot: keeping the bearer token, and holding the credentials server-side.
 *
 * Docs: https://docs.onezeroart.com/zalultra/api_integration/
 */

// The docs disagree on the login path (the auth index says /api/v1/auth/login,
// the user page says /api/auth-login), so try both and remember the winner.
const LOGIN_PATHS = ['/api/v1/auth/login', '/api/auth-login'];

// Refresh a little early rather than racing the expiry.
const TOKEN_SKEW_MS = 60 * 1000;

function httpError(status, message, body) {
  const err = new Error(message);
  err.status = status;
  err.body = body;
  return err;
}

class ZalClient {
  constructor({ baseUrl, username, password, ispId, branchId, timeout = 15000 }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.ispId = ispId;
    this.branchId = branchId;
    this.timeout = timeout;

    this.token = null;
    this.tokenExpiry = 0;
    this.userId = null;
    this.loginPath = null;
    this.loginInFlight = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Ids nearly every endpoint requires, merged into calls that omit them. */
  get defaults() {
    return { isp_id: this.ispId, branch_id: this.branchId, user_id: this.userId };
  }

  get(path, query) {
    return this.request('GET', path, { query });
  }

  post(path, body, query) {
    return this.request('POST', path, { body, query });
  }

  put(path, body, query) {
    return this.request('PUT', path, { body, query });
  }

  /**
   * Walks Laravel's `pagination.last_page` and returns every row flattened.
   * Lookup endpoints ignore `limit` and hand back 15 rows a page, so a single
   * call quietly truncates - areas came back 15 of 98.
   */
  async getAll(path, key, query = {}, maxPages = 60) {
    const rows = [];
    let page = 1;
    let lastPage = 1;

    while (page <= lastPage && page <= maxPages) {
      const res = await this.get(path, { ...query, page });
      const payload = res?.data ?? res;

      const batch = Array.isArray(res)
        ? res
        : Array.isArray(payload?.[key])
          ? payload[key]
          : this.firstArray(payload) || [];

      rows.push(...batch);

      const pagination = payload?.pagination;
      if (!pagination) break; // unpaginated endpoint - one response is all of it

      lastPage = Number(pagination.last_page) || 1;
      page += 1;
    }

    return rows;
  }

  /** The sole array inside a payload, when the key is not what we expected. */
  firstArray(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const arrays = Object.values(payload).filter((v) => Array.isArray(v));
    return arrays.length === 1 ? arrays[0] : null;
  }

  /**
   * Diagnostic call: returns the upstream status and body verbatim instead of
   * throwing, so an empty or unexpected response can actually be seen.
   */
  async raw(method, path, query = {}) {
    const token = await this.authenticate();
    const merged = { ...this.defaults, ...query };
    const res = await this.fetchJson(method, path, { query: merged, token });
    return {
      requested: { method, path, query: merged },
      status: res.status,
      empty: res.data && Object.keys(res.data).length === 0,
      data: res.data,
    };
  }

  /** Verifies the credentials without touching subscriber data. */
  async health() {
    await this.authenticate(true);
    return { status: 'ok', loginPath: this.loginPath, userId: this.userId };
  }

  /**
   * Authenticated call. Missing isp_id / branch_id / user_id are filled from
   * config so callers only send what actually varies.
   */
  async request(method, path, { query = {}, body = null } = {}) {
    const token = await this.authenticate();

    const send = (tok) => {
      const merged = { ...this.defaults, ...query };
      const payload = body ? { ...this.defaults, ...body } : null;
      return this.fetchJson(method, path, { query: merged, body: payload, token: tok });
    };

    let res = await send(token);

    // The token can be revoked server-side before it expires on paper.
    if (res.status === 401) {
      res = await send(await this.authenticate(true));
    }

    if (!res.ok) {
      throw httpError(res.status, this.messageFrom(res.data) || `ZalUltra returned ${res.status}`, res.data);
    }

    // The panel reports some failures with HTTP 200 and an error in the body,
    // so the status line alone cannot be trusted.
    if (this.isBodyFailure(res.data)) {
      throw httpError(422, this.messageFrom(res.data) || 'ZalUltra rejected the request.', res.data);
    }

    if (process.env.ZAL_DEBUG === '1' && method !== 'GET') {
      console.log(`[zal] ${method} ${path}`, JSON.stringify(res.data).slice(0, 500));
    }

    return res.data;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /** Returns a valid token, logging in only when the cached one is stale. */
  authenticate(force = false) {
    if (!force && this.token && Date.now() < this.tokenExpiry - TOKEN_SKEW_MS) {
      return Promise.resolve(this.token);
    }
    // Collapse parallel calls onto one login round-trip.
    if (!this.loginInFlight) {
      this.loginInFlight = this.login().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  async login() {
    if (!this.password) {
      throw httpError(500, 'ZAL_PASS is not set on the proxy (backend/.env or the Vercel dashboard).');
    }

    const paths = this.loginPath ? [this.loginPath] : LOGIN_PATHS;
    // The docs name the field `email`, but the account may be a plain username.
    const shapes = [
      { email: this.username, password: this.password },
      { username: this.username, password: this.password },
    ];

    let lastError = null;

    for (const path of paths) {
      for (const shape of shapes) {
        const res = await this.fetchJson('POST', path, { body: shape });

        if (res.ok) {
          const token = this.tokenFrom(res.data);
          if (!token) {
            lastError = httpError(502, 'ZalUltra accepted the login but returned no token.', res.data);
            continue;
          }
          this.loginPath = path;
          this.token = token;
          const ttl = Number(res.data?.expires_in ?? res.data?.data?.expires_in ?? 3600);
          this.tokenExpiry = Date.now() + Math.max(120, ttl) * 1000;
          this.userId = res.data?.user?.id ?? res.data?.data?.user?.id ?? this.userId;
          return this.token;
        }

        lastError = httpError(res.status, this.messageFrom(res.data) || `Login failed (${res.status})`, res.data);
        if (res.status === 404) break; // wrong path - no point trying the other body
      }
    }

    throw lastError || httpError(502, 'ZalUltra login failed.');
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  async fetchJson(method, path, { query = {}, body = null, token = null } = {}) {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'ETIMEDOUT' : err?.cause?.code || err?.code || err?.message;
      throw httpError(
        reason === 'ETIMEDOUT' ? 504 : 503,
        `Cannot reach ZalUltra at ${this.baseUrl} (${reason}).`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      // An HTML error page means the path is wrong or a gateway answered.
      data = { message: text.slice(0, 300) };
    }

    return { status: response.status, ok: response.ok, data };
  }

  /** A 200 carrying { status: 'error' } or { success: false } is still a failure. */
  isBodyFailure(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (data.success === false) return true;
    const status = String(data.status || '').toLowerCase();
    return status === 'error' || status === 'failed' || status === 'fail';
  }

  tokenFrom(data) {
    return (
      data?.token ||
      data?.access_token ||
      data?.data?.token ||
      data?.data?.access_token ||
      null
    );
  }

  messageFrom(data) {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (data.message) return data.message;
    if (data.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    if (data.errors) return Object.values(data.errors).flat().join(', ');
    return null;
  }
}

module.exports = { ZalClient };
