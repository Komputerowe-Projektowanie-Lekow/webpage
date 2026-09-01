'use strict';

/*
 * PUT Drug Discovery — static site + backend.
 *
 * Serves the existing hand-authored HTML/CSS/JS from this folder and adds a
 * small API backed by Azure Cosmos DB:
 *
 *   POST /api/contact          store a contact-form submission (container: leads)
 *   POST /api/track            store an anonymous page view       (container: events)
 *   GET  /api/health           liveness + storage status
 *   GET  /api/leads            list submissions        (header: x-admin-key)
 *   GET  /api/events/summary   aggregated traffic       (header: x-admin-key)
 *
 * Required App Service application settings:
 *   COSMOS_CONNECTION_STRING   primary connection string of the Cosmos account
 *   ADMIN_KEY                  shared secret for the /api/leads + summary routes
 * Optional:
 *   COSMOS_DB                  database id (default: "site")
 *   ANALYTICS_SALT            salt for the daily visitor hash (default: ADMIN_KEY)
 *   APPLICATIONINSIGHTS_CONNECTION_STRING   enables App Insights when present
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const compression = require('compression');

// ---- Application Insights (optional, no-op when not configured) --------------
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  try {
    require('applicationinsights')
      .setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
      .setAutoCollectConsole(false)
      .setSendLiveMetrics(false)
      .start();
    console.log('Application Insights enabled');
  } catch (err) {
    console.error('Application Insights init failed:', err.message);
  }
}

const { CosmosClient } = require('@azure/cosmos');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const SALT = process.env.ANALYTICS_SALT || ADMIN_KEY || 'insecure-dev-salt';
const DB_NAME = process.env.COSMOS_DB || 'site';

let leads = null;
let events = null;
let cosmosStatus = 'starting';

async function ensureContainer(db, id) {
  try {
    const { container } = await db.containers.createIfNotExists({
      id,
      partitionKey: { paths: ['/type'] },
    });
    return container;
  } catch (err) {
    // Database has no shared throughput — create the container with its own.
    const { container } = await db.containers.createIfNotExists({
      id,
      partitionKey: { paths: ['/type'] },
      throughput: 400,
    });
    return container;
  }
}

async function initCosmos() {
  const conn = process.env.COSMOS_CONNECTION_STRING;
  if (!conn) {
    cosmosStatus = 'no COSMOS_CONNECTION_STRING';
    return;
  }
  const client = new CosmosClient(conn);
  let db;
  try {
    ({ database: db } = await client.databases.createIfNotExists({
      id: DB_NAME,
      throughput: 400,
    }));
  } catch (err) {
    ({ database: db } = await client.databases.createIfNotExists({ id: DB_NAME }));
  }
  leads = await ensureContainer(db, 'leads');
  events = await ensureContainer(db, 'events');
  cosmosStatus = 'ready';
  console.log('Cosmos DB ready (database: %s)', DB_NAME);
}

initCosmos().catch((err) => {
  cosmosStatus = 'error: ' + err.message;
  console.error('Cosmos init failed:', err.message);
});

// ---- app -------------------------------------------------------------------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '32kb' }));

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || '';
}

// Rotating, non-reversible visitor id: no raw IP is ever stored (GDPR-friendly,
// same idea as Plausible). Changes every UTC day.
function visitorHash(req) {
  const day = new Date().toISOString().slice(0, 10);
  return crypto
    .createHash('sha256')
    .update(clientIp(req) + '|' + (req.headers['user-agent'] || '') + '|' + day + '|' + SALT)
    .digest('hex')
    .slice(0, 32);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY || req.get('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, cosmos: cosmosStatus, time: new Date().toISOString() });
});

app.post('/api/contact', async (req, res) => {
  if (!leads) return res.status(503).json({ error: 'storage unavailable' });
  const b = req.body || {};

  if (str(b.website, 100)) return res.json({ ok: true }); // honeypot

  const name = str(b.name, 200);
  const email = str(b.email, 320);
  const message = str(b.message, 4000);
  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'name, valid email and message are required' });
  }

  try {
    await leads.items.create({
      id: crypto.randomUUID(),
      type: 'lead',
      name,
      email,
      company: str(b.company, 200),
      area: str(b.area, 200),
      message,
      ref: str(b.ref || req.get('referer'), 500),
      ua: str(req.get('user-agent'), 400),
      lang: str(b.lang, 40),
      visitor: visitorHash(req),
      ts: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('contact write failed:', err.message);
    res.status(500).json({ error: 'could not save' });
  }
});

app.post('/api/track', async (req, res) => {
  res.status(202).end(); // never block the page
  if (!events) return;
  const b = req.body || {};
  try {
    await events.items.create({
      id: crypto.randomUUID(),
      type: 'pageview',
      path: str(b.path, 300) || '/',
      ref: str(b.ref, 500),
      lang: str(b.lang, 40),
      screen: str(b.screen, 20),
      tz: str(b.tz, 60),
      ua: str(req.get('user-agent'), 400),
      visitor: visitorHash(req),
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.error('track write failed:', err.message);
  }
});

app.get('/api/leads', requireAdmin, async (req, res) => {
  if (!leads) return res.status(503).json({ error: 'storage unavailable' });
  try {
    const { resources } = await leads.items
      .query("SELECT * FROM c WHERE c.type = 'lead' ORDER BY c.ts DESC OFFSET 0 LIMIT 500")
      .fetchAll();
    res.json(resources);
  } catch (err) {
    console.error('leads query failed:', err.message);
    res.status(500).json({ error: 'query failed' });
  }
});

app.get('/api/events/summary', requireAdmin, async (req, res) => {
  if (!events) return res.status(503).json({ error: 'storage unavailable' });
  try {
    const { resources } = await events.items
      .query(
        "SELECT c.path, c.ref, c.visitor, c.ts FROM c WHERE c.type = 'pageview' ORDER BY c.ts DESC OFFSET 0 LIMIT 5000"
      )
      .fetchAll();

    const byPath = {};
    const byRef = {};
    const visitors = new Set();
    for (const e of resources) {
      byPath[e.path] = (byPath[e.path] || 0) + 1;
      let host = 'direct';
      if (e.ref) {
        try {
          host = new URL(e.ref).hostname || 'direct';
        } catch (_) {
          host = 'other';
        }
      }
      byRef[host] = (byRef[host] || 0) + 1;
      visitors.add(e.visitor);
    }
    const top = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 20);
    res.json({
      sampleSize: resources.length,
      uniqueVisitors: visitors.size,
      topPages: top(byPath),
      topReferrers: top(byRef),
      newest: resources[0] ? resources[0].ts : null,
    });
  } catch (err) {
    console.error('summary query failed:', err.message);
    res.status(500).json({ error: 'query failed' });
  }
});

// ---- static site ---------------------------------------------------------
// Do not expose the server's own source / config.
app.use((req, res, next) => {
  if (/^\/(server\.js|package(-lock)?\.json)$/i.test(req.path)) {
    return res.status(404).end();
  }
  next();
});

app.use(
  express.static(ROOT, {
    extensions: ['html'],
    dotfiles: 'ignore',
    setHeaders(res, filePath) {
      if (/\.(mp4|webm|gif|png|jpg|jpeg|svg|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else if (/\.(js|css)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300');
      }
    },
  })
);

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, () => console.log('PUT Drug Discovery listening on port ' + PORT));
