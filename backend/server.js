require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { MikrotikConn } = require('./mikrotik-api');
const { ZalClient } = require('./zal-api');

const app = express();
app.use(express.json());

// ── CORS ─────────────────────────────────────────────────────────────────────
// The Capacitor mobile app serves itself from these origins (Android with
// androidScheme 'https', and iOS), so they are always allowed on top of
// ALLOWED_ORIGINS - otherwise every call from the app is rejected.
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];

const allowedOrigins = [
  ...(
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:4200,https://ranjha7starcable.web.app'
  ).split(','),
  ...APP_ORIGINS,
].map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

// ── MikroTik config ───────────────────────────────────────────────────────────
// RouterOS 6.x uses the MikroTik API protocol on port 8728.
// Enable it first on the router: /ip service set api disabled=no

// Server 1 — 103.66.149.194 (194.1002)
const MIKROTIK_HOST = process.env.MIKROTIK_HOST || '103.66.149.194';
const MIKROTIK_PORT = parseInt(process.env.MIKROTIK_PORT || '8728', 10);
const MIKROTIK_USER = process.env.MIKROTIK_USER || 'saqibr';
const MIKROTIK_PASS = process.env.MIKROTIK_PASS || '';

// Server 2 — 103.66.149.195 (195.9998)
const MIKROTIK_HOST_2 = process.env.MIKROTIK_HOST_2 || '103.66.149.195';
const MIKROTIK_PORT_2 = parseInt(process.env.MIKROTIK_PORT_2 || '8728', 10);
const MIKROTIK_USER_2 = process.env.MIKROTIK_USER_2 || 'admin';
const MIKROTIK_PASS_2 = process.env.MIKROTIK_PASS_2 || '';

function makeWithRouter(host, port, user, pass) {
  return async function withRouter(res, fn) {
    const conn = new MikrotikConn({ host, port, timeout: 6000 });
    try {
      await conn.connect(user, pass);
      const result = await fn(conn);
      res.json(result);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('ECONNREFUSED')) {
        res.status(503).json({ message: `Cannot connect to ${host}:${port}. Is the MikroTik API service enabled? (/ip service set api disabled=no)` });
      } else if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
        res.status(504).json({ message: `Connection to ${host}:${port} timed out. Check that port ${port} is open and not blocked by the router firewall.` });
      } else {
        res.status(500).json({ message: msg });
      }
    } finally {
      conn.close();
    }
  };
}

const withRouter  = makeWithRouter(MIKROTIK_HOST,   MIKROTIK_PORT,   MIKROTIK_USER,   MIKROTIK_PASS);
const withRouter2 = makeWithRouter(MIKROTIK_HOST_2, MIKROTIK_PORT_2, MIKROTIK_USER_2, MIKROTIK_PASS_2);

// ── Route factory ────────────────────────────────────────────────────────────

function registerRoutes(prefix, withRtr) {
  // PPP / PPPoE secret  (most common for ISPs)
  app.put(`${prefix}/ppp/secret`, async (req, res) => {
    const { name, password, profile = 'default', service = 'pppoe', disabled = 'no' } = req.body;
    if (!name || !password) return res.status(400).json({ message: 'name and password are required' });
    await withRtr(res, (conn) => conn.add('/ppp/secret', { name, password, profile, service, disabled }));
  });

  // Hotspot user
  app.put(`${prefix}/ip/hotspot/user`, async (req, res) => {
    const { name, password, profile = 'default' } = req.body;
    if (!name || !password) return res.status(400).json({ message: 'name and password are required' });
    await withRtr(res, (conn) => conn.add('/ip/hotspot/user', { name, password, profile }));
  });

  // Router management user
  app.put(`${prefix}/user`, async (req, res) => {
    const { name, password, group = 'full' } = req.body;
    if (!name || !password) return res.status(400).json({ message: 'name and password are required' });
    await withRtr(res, (conn) => conn.add('/user', { name, password, group }));
  });

  // Get all PPP secrets
  app.get(`${prefix}/ppp/secret`, async (req, res) => {
    await withRtr(res, (conn) => conn.get('/ppp/secret'));
  });

  // Update PPP secret by .id (passed in body)
  app.patch(`${prefix}/ppp/secret`, async (req, res) => {
    const { id, ...attrs } = req.body;
    if (!id) return res.status(400).json({ message: 'id is required' });
    await withRtr(res, (conn) => conn.set('/ppp/secret', id, attrs));
  });

  // Delete PPP secret by .id (passed in body)
  app.delete(`${prefix}/ppp/secret`, async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'id is required' });
    await withRtr(res, (conn) => conn.remove('/ppp/secret', id));
  });

  // PPP profiles (for populating the profile dropdown)
  app.get(`${prefix}/ppp/profile`, async (req, res) => {
    await withRtr(res, (conn) => conn.get('/ppp/profile'));
  });

  // Bulk enable all PPP secrets (single connection, loop server-side)
  app.post(`${prefix}/ppp/secret/bulk-enable`, async (req, res) => {
    await withRtr(res, async (conn) => {
      const secrets = await conn.get('/ppp/secret');
      let updated = 0;
      for (const secret of secrets) {
        if (secret.disabled === 'yes' || secret.disabled === 'true') {
          await conn.set('/ppp/secret', secret['.id'], { disabled: 'no' });
          updated++;
        }
      }
      return { updated, total: secrets.length };
    });
  });

  // Bulk disable all PPP secrets (single connection, loop server-side)
  app.post(`${prefix}/ppp/secret/bulk-disable`, async (req, res) => {
    await withRtr(res, async (conn) => {
      const secrets = await conn.get('/ppp/secret');
      let updated = 0;
      for (const secret of secrets) {
        if (secret.disabled !== 'yes' && secret.disabled !== 'true') {
          await conn.set('/ppp/secret', secret['.id'], { disabled: 'yes' });
          updated++;
        }
      }
      return { updated, total: secrets.length };
    });
  });

  // System resource (connection health check)
  app.get(`${prefix}/system/resource`, async (req, res) => {
    await withRtr(res, async (conn) => {
      const rows = await conn.get('/system/resource');
      return rows[0] || {};
    });
  });
}

// ── Register routes for both servers ─────────────────────────────────────────

registerRoutes('/mikrotik',  withRouter);   // Server 1 — 103.66.149.194
registerRoutes('/mikrotik2', withRouter2);  // Server 2 — 103.66.149.195

// ── ZalUltra ISP CRM ─────────────────────────────────────────────────────────
// The panel is served over plain HTTP, so the browser refuses to call it from
// the HTTPS app (mixed content) — every request has to come through here.

const zal = new ZalClient({
  baseUrl:  process.env.ZAL_BASE_URL || 'http://182.180.126.189',
  username: process.env.ZAL_USER || 'qaisar',
  password: process.env.ZAL_PASS || '',
  ispId:    process.env.ZAL_ISP_ID || 1,
  branchId: process.env.ZAL_BRANCH_ID || 1,
});

async function withZal(res, fn) {
  try {
    res.json(await fn(zal));
  } catch (err) {
    const status = err?.status && err.status >= 400 ? err.status : 500;
    res.status(status).json({ message: err?.message || String(err) });
  }
}

// Credential / reachability check — no subscriber data touched.
app.get('/zal/health', async (_req, res) => {
  await withZal(res, (z) => z.health());
});

app.get('/zal/subscribers', async (req, res) => {
  await withZal(res, (z) => z.get('/api/v1/subscribers', req.query));
});

app.get('/zal/subscribers/details', async (req, res) => {
  if (!req.query.id) return res.status(400).json({ message: 'id is required' });
  await withZal(res, (z) => z.get('/api/v1/subscribers/details', req.query));
});

app.post('/zal/subscribers/enable-net', async (req, res) => {
  if (!req.body?.subscriber_id) return res.status(400).json({ message: 'subscriber_id is required' });
  await withZal(res, (z) => z.post('/api/v1/subscribers/enable-net', req.body));
});

app.post('/zal/subscribers/disable-net', async (req, res) => {
  if (!req.body?.subscriber_id) return res.status(400).json({ message: 'subscriber_id is required' });
  await withZal(res, (z) => z.post('/api/v1/subscribers/disable-net', req.body));
});

// isp_id / branch_id / user_id are injected by the client, so the app only
// sends what actually varies.
app.post('/zal/subscribers/create', async (req, res) => {
  const { username, fullname, password, package_id } = req.body || {};
  if (!username || !fullname || !password || !package_id) {
    return res.status(400).json({
      message: 'username, fullname, password and package_id are required',
    });
  }
  await withZal(res, (z) => z.post('/api/v1/subscribers/create', req.body));
});

app.put('/zal/subscribers/update', async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ message: 'id is required' });
  await withZal(res, (z) => z.put('/api/v1/subscribers/update', req.body));
});

// Deletion takes its parameters on the query string, not the body.
app.delete('/zal/subscribers/delete', async (req, res) => {
  const id = req.query.id || req.body?.id;
  if (!id) return res.status(400).json({ message: 'id is required' });
  await withZal(res, async (z) => {
    // Docs say query string; send a body too so it works either way.
    const result = await z.request('DELETE', '/api/v1/subscribers/delete', {
      query: { id },
      body: { id },
    });

    // The panel has reported success while leaving the subscriber in place, so
    // confirm rather than trust the response.
    const check = await z.get('/api/v1/subscribers', { subscriber_id: id });
    const rows = Array.isArray(check) ? check : check?.data?.subscribers || [];
    if (rows.some((r) => String(r?.id) === String(id))) {
      const err = new Error(
        'ZalUltra accepted the delete but the subscriber still exists on the panel - ' +
          'the account may lack delete permission.',
      );
      err.status = 502;
      throw err;
    }

    return result;
  });
});

// Renew / recharge - `preview_only: 1` prices it without charging.
app.post('/zal/subscribers/activation', async (req, res) => {
  if (!req.body?.subscriber_id) return res.status(400).json({ message: 'subscriber_id is required' });
  await withZal(res, (z) => z.post('/api/v1/subscribers/activation', req.body));
});

// Salespeople for the create form - the panel requires salesperson_id even
// though the docs list it as optional.
app.get('/zal/users', async (req, res) => {
  await withZal(res, (z) => z.getAll('/api/v1/users', 'users', req.query));
});

app.get('/zal/nas', async (req, res) => {
  await withZal(res, (z) => z.getAll('/api/v1/nas', 'nas', req.query));
});

app.get('/zal/packages', async (req, res) => {
  await withZal(res, (z) => z.getAll('/api/v1/packages', 'packages', req.query));
});

// isp_id / branch_id are required by almost everything and default to 1 -
// these two say what the account actually has.
// The subscriber list returns a bare array with no count - the real totals
// (5,575 etc) only exist here.
app.get('/zal/stats', async (req, res) => {
  await withZal(res, (z) => z.get('/api/v1/dashboard/subscriber-stats', req.query));
});

app.get('/zal/areas', async (req, res) => {
  await withZal(res, (z) => z.getAll('/api/v1/areas', 'areas', req.query));
});

app.get('/zal/isps', async (_req, res) => {
  await withZal(res, (z) => z.get('/api/v1/isps'));
});

app.get('/zal/branches', async (req, res) => {
  await withZal(res, (z) => z.get('/api/v1/branches', req.query));
});

// Read-only escape hatch for diagnosing an unexpected response. Off unless
// ZAL_DEBUG=1, because it can read any GET endpoint on the panel.
app.get('/zal/debug', async (req, res) => {
  if (process.env.ZAL_DEBUG !== '1') {
    return res.status(404).json({ message: 'Debug route disabled (set ZAL_DEBUG=1).' });
  }
  const { path, ...query } = req.query;
  if (!path || !String(path).startsWith('/api/')) {
    return res.status(400).json({ message: 'path is required, e.g. ?path=/api/v1/subscribers' });
  }
  await withZal(res, (z) => z.raw('GET', String(path), query));
});

// Proxy liveness (no router connection)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Start ─────────────────────────────────────────────────────────────────────
// When run directly (local dev), start the HTTP server.
// When imported by Vercel serverless, just export the app.
if (require.main === module) {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  app.listen(PORT, () => {
    console.log(`MikroTik proxy running on http://localhost:${PORT}`);
    console.log(`Server 1: ${MIKROTIK_HOST}:${MIKROTIK_PORT}`);
    console.log(`Server 2: ${MIKROTIK_HOST_2}:${MIKROTIK_PORT_2}`);
  });
}

module.exports = app;
