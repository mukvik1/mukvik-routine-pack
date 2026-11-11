'use strict';

const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { USD_UAH_RATE, uahKopiykas, isTrustedCheckoutUrl } = require('./monobank');
const manifest = require('./config/standard-pack-files.json');

const PRICE_CENTS = 1500;
const AMOUNT_KOP = uahKopiykas(PRICE_CENTS, USD_UAH_RATE);
const VALIDITY = 3600;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const secretPattern = /^[A-Za-z0-9_-]{43}$/;
const providerPattern = /^[A-Za-z0-9_-]{5,128}$/;
const existingRoutines = {
  'yeah-la-vida-es-un-carnaval': 'routine3',
  'not-like-us-candy-shop': 'routine5',
  'macarena-candy-shop': 'routine7',
  'levitation-cant-stop-rompe': 'routine8',
  'i-know-you-want-me-chandelier': 'routine9',
  'calm-down-crazy-in-love': 'routine10',
  'tell-me-why-trust-me': 'routine11',
  'call-me-maybe-poker-face': 'routine12'
};

function catalogFiles(files, packManifest = manifest) {
  // Drive copies have different IDs. Prefer exact hashes; otherwise accept only
  // a unique filename in the already validated, server-side Pack configuration.
  const byHash = new Map(), byName = new Map(), claimed = new Set();
  const basename = name => typeof name === 'string' ? name.split(/[\\/]/).pop().normalize('NFC').trim() : '';
  for (const file of Array.isArray(files.pack) ? files.pack : []) {
    if (!/^[-\w]{10,128}$/.test(file?.fileId || '')) continue;
    byHash.set(sha(file.fileId), file.fileId);
    const name = basename(file.name);
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(file.fileId);
  }
  const entries = new Map(packManifest.map(r => [r.slug, r.files.map(f => {
    const matching = byName.get(basename(f.name));
    const fileId = byHash.get(f.key) || (matching?.size === 1 ? matching.values().next().value : undefined);
    if (!fileId || claimed.has(fileId)) {
      throw Object.assign(Error('Invalid subscription file mapping: ' + r.slug), { code: 'STANDARD_FILES_INVALID', routine: r.slug });
    }
    claimed.add(fileId);
    return { name: f.name, fileId };
  })]));
  for (const [slug, code] of Object.entries(existingRoutines)) {
    entries.set(slug, Array.isArray(files[code]) ? files[code].map(file => ({fileId:file?.fileId,name:basename(file?.name)})) : null);
  }
  for (const [slug, list] of entries) {
    if (!Array.isArray(list) || !list.length || list.some(f => !/^[-\w]{10,128}$/.test(f?.fileId || '') ||
      typeof f.name !== 'string' || !f.name || f.name.length > 160 || /[\\/\x00-\x1f]/.test(f.name) ||
      f.name === '.' || f.name === '..') || new Set(list.map(f => f.name.toLowerCase())).size !== list.length) {
      throw Object.assign(Error('Invalid subscription file mapping: ' + slug), { code: 'STANDARD_FILES_INVALID', routine: slug });
    }
  }
  return entries;
}

// Add paid calendar months to the provider start date, clamping the day for short months.
function paidThrough(start, count) {
  const date = new Date(start);
  if (!start || !Number.isFinite(+date) || !Number.isSafeInteger(count) || count < 1 || count > 1200) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return date;
}
function interpretStatus(row, data, now = Date.now()) {
  const started = Date.parse(data?.startDate);
  if (data?.subscriptionId !== row.provider_id || data.amount !== row.amount_kop ||
      data.ccy !== 980 || data.interval !== '1m' || typeof data.status !== 'string' ||
      !Number.isSafeInteger(data.summary?.totalPaid) || data.summary.totalPaid < 0) return null;
  const paidUntil = Number.isFinite(started) && started >= +new Date(row.created_at) - 60000 && started <= now + 60000
    ? paidThrough(data.startDate, data.summary.totalPaid) : null;
  if (data.summary.totalPaid > 0 && !paidUntil) return null;
  return { paidUntil, status: data.status.slice(0, 40), cancelled: /^(cancelled|canceled|expired|invalidated)$/i.test(data.status) };
}

function createStandard(settings, { pool, files, getDriveToken, fetchImpl = fetch, driveFetch = fetch, reply, packManifest }) {
  if (settings.STANDARD_SUBSCRIPTIONS_ENABLED === 'false' || !settings.MONOBANK_SUBSCRIPTION_TOKEN) return null;
  const entries = catalogFiles(files, packManifest);
  const publicOrigin = new URL(settings.PUBLIC_ORIGIN);
  const webOrigin = new URL(settings.WEB_ORIGIN);
  if (publicOrigin.protocol !== 'https:' || webOrigin.protocol !== 'https:') throw Error('Subscription checkout requires HTTPS');
  async function api(operation, args, method = 'GET') {
    const endpoint = new URL('https://api.monobank.ua/api/merchant/subscription/' + operation);
    if (method === 'GET') endpoint.search = new URLSearchParams(args);
    const result = await fetchImpl(endpoint, {
      method, headers: { 'X-Token': settings.MONOBANK_SUBSCRIPTION_TOKEN, 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(args) : undefined, signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    if (!result.ok) throw Object.assign(Error('Subscription provider request failed'), { code: 'STANDARD_MONO_HTTP_' + result.status });
    if (operation === 'edit') return;
    return result.json();
  }
  async function locked(customerId, run) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [customerId]);
      const result = await run(db);
      await db.query('COMMIT');
      return result;
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    finally { db.release(); }
  }
  async function latest(db, id) {
    const r = await db.query('SELECT * FROM standard_subscriptions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 1', [id]);
    return r.rows[0];
  }
  async function reconcile(db, row) {
    const data = await api('status', { subscriptionId: row.provider_id });
    const parsed = interpretStatus(row, data);
    if (!parsed) throw Object.assign(Error('Unexpected subscription status'), { code: 'STANDARD_STATUS_INVALID' });
    const r = await db.query(`UPDATE standard_subscriptions SET paid_until=$2,provider_status=$3,checked_at=now(),
      cancelled_at=CASE WHEN $4 THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END WHERE id=$1 RETURNING *`,
      [row.id, parsed.paidUntil, parsed.status, parsed.cancelled]);
    return r.rows[0];
  }
  async function status(res, user, refresh = false) {
    let row = await latest(pool, user.id);
    if (row && (!row.checked_at || Date.now() - +new Date(row.checked_at) > (refresh ? 5000 : 60000))) {
      row = await locked(user.id, async db => {
        const current = await latest(db, user.id);
        if (current.checked_at && Date.now() - +new Date(current.checked_at) < (refresh ? 5000 : 60000)) return current;
        return reconcile(db, current);
      }).catch(e => { console.error('Standard status unavailable:', e.code || e.name); return row; });
    }
    return reply(res, 200, {
      active: Boolean(row?.paid_until && +new Date(row.paid_until) > Date.now()),
      paidUntil: row?.paid_until || null,
      cancellable: Boolean(row && !row.cancelled_at),
      pending: Boolean(row && !row.cancelled_at && !row.paid_until),
      cancelled: Boolean(row?.cancelled_at)
    });
  }
  async function checkout(res, user, consent) {
    if (consent !== true || !user.email_verified_at) return reply(res, 400, { error: 'Verify your email and confirm the recurring payment terms.' });
    const result = await locked(user.id, async db => {
      let row = await latest(db, user.id);
      if (row && !row.cancelled_at) {
        if (!row.paid_until && +new Date(row.checkout_expires_at) > Date.now() && (!row.provider_status || ['created','pending'].includes(row.provider_status))) {
          return { status: 200, data: { checkoutUrl: row.checkout_url } };
        }
        row = await reconcile(db, row);
        if (!row.cancelled_at) return { status: 409, data: { error: 'A subscription already exists. Check its status or cancel it in your account.' } };
      }
      if (row?.paid_until && +new Date(row.paid_until) > Date.now()) {
        return { status: 409, data: { error: 'Your existing paid access is still active.' } };
      }
      const id = crypto.randomUUID(), callback = random(), started = new Date();
      const callbackUrl = publicOrigin.origin + '/api/v2/standard/callback/' + callback;
      const created = await api('create', {
        amount: AMOUNT_KOP, ccy: 980, interval: '1m', validity: VALIDITY,
        redirectUrl: webOrigin.origin + '/routines/?subscription=return#standard-plan',
        webHookUrls: { chargeUrl: callbackUrl, statusUrl: callbackUrl }
      }, 'POST');
      if (!providerPattern.test(created?.subscriptionId || '') || !isTrustedCheckoutUrl(created.pageUrl)) {
        throw Object.assign(Error('Invalid subscription checkout response'), { code: 'STANDARD_CHECKOUT_INVALID' });
      }
      await db.query(`INSERT INTO standard_subscriptions
        (id,customer_id,provider_id,callback_hash,checkout_url,amount_kop,created_at,checkout_expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, user.id, created.subscriptionId, sha(callback), created.pageUrl, AMOUNT_KOP, started, new Date(+started + VALIDITY * 1000)]);
      return { status: 201, data: { checkoutUrl: created.pageUrl } };
    });
    return reply(res, result.status, result.data);
  }
  async function cancel(res, user) {
    await locked(user.id, async db => {
      const row = await latest(db, user.id);
      if (!row || row.cancelled_at) return;
      await api('edit', { subscriptionId: row.provider_id, action: 'cancel' }, 'POST');
      await db.query('UPDATE standard_subscriptions SET cancelled_at=now() WHERE id=$1', [row.id]);
    });
    return status(res, user);
  }
  async function callback(res, secret) {
    // The unguessable callback is a wake-up signal. No event payload can grant access:
    // always retrieve the actual subscription record from Monobank using the server token.
    if (!secretPattern.test(secret)) return reply(res, 404, { error: 'Not found.' });
    const {rows} = await pool.query('SELECT id,customer_id FROM standard_subscriptions WHERE callback_hash=$1', [sha(secret)]);
    if (!rows.length) return reply(res, 404, { error: 'Not found.' });
    await locked(rows[0].customer_id, async db => {
      const r = await db.query('SELECT * FROM standard_subscriptions WHERE id=$1', [rows[0].id]);
      if (r.rows[0]) await reconcile(db, r.rows[0]);
    });
    return reply(res, 200, { ok: true });
  }
  async function ticket(res, user, slug) {
    if (!entries.has(slug)) return reply(res, 404, { error: 'Routine not found.' });
    const secret = random();
    const r = await pool.query(`INSERT INTO standard_download_tickets(token_hash,customer_id,routine_slug,expires_at)
      SELECT $1,$2,$3,now()+interval '60 seconds'
      WHERE EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=$2 AND paid_until>now()) RETURNING token_hash`,
    [sha(secret), user.id, slug]);
    if (!r.rowCount) return reply(res, 403, { error: 'An active subscription is required.' });
    return reply(res, 200, { url: '/api/v2/standard/download/' + secret });
  }
  async function download(res, secret) {
    if (!secretPattern.test(secret)) return reply(res, 404, { error: 'Not found.' });
    const r = await pool.query(`DELETE FROM standard_download_tickets AS t WHERE token_hash=$1 AND expires_at>now()
      AND EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=t.customer_id AND paid_until>now())
      RETURNING routine_slug`, [sha(secret)]);
    if (!r.rowCount) return reply(res, 410, { error: 'Download link expired or already used.' });
    const slug = r.rows[0].routine_slug, list = entries.get(slug);
    if (!list) return reply(res, 404, { error: 'Routine not found.' });
    const driveToken = await getDriveToken();
    if (!driveToken) throw Error('Drive authorization unavailable');
    const { ZipFile } = require('yazl');
    const zip = new ZipFile(), abort = new AbortController();
    res.once('close', () => abort.abort());
    for (const file of list) {
      zip.addReadStreamLazy(file.name, { compress: false }, done => {
        driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.fileId) + '?alt=media', {
          headers: { Authorization: 'Bearer ' + driveToken },
          signal: abort.signal, redirect: 'error'
        }).then(async result => {
          if (!result.ok || !result.body) {
            await result.body?.cancel();
            throw Error('Routine file unavailable');
          }
          return Readable.fromWeb(result.body);
        }).then(stream => done(null, stream), done);
      });
    }
    zip.on('error', error => zip.outputStream.destroy(error));
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + slug +
      '.zip"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    zip.end();
    try { await pipeline(zip.outputStream, res); } catch { res.destroy(); }
  }
  function cleanup() {
    return pool.query('DELETE FROM standard_download_tickets WHERE expires_at <= now()');
  }
  return { status, checkout, cancel, callback, ticket, download, cleanup, catalog: { priceCents: PRICE_CENTS, amountKop: AMOUNT_KOP, slugs: [...entries.keys()] } };
}
module.exports = { createStandard, catalogFiles, interpretStatus, paidThrough };
