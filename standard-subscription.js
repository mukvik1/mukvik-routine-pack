'use strict';

const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { USD_UAH_RATE, uahKopiykas, isTrustedCheckoutUrl } = require('./monobank');
const manifest = require('./config/standard-pack-files.json');
const routinePaths = require('./config/routine-paths.json');
const routineNames = new Map([
  ...routinePaths.map(routine => [routine.id, routine.title]),
  ['call-me-maybe-poker-face','Call Me Maybe x Poker Face'],
  ['tell-me-why-trust-me','Tell Me Why x Trust Me'],
  ['calm-down-crazy-in-love','Calm Down x Crazy in Love'],
  ['yeah-la-vida-es-un-carnaval','Yeah x La Vida Es Un Carnaval'],
  ['not-like-us-candy-shop','Not Like Us x Candy Shop'],
  ['macarena-candy-shop','Macarena x Candy Shop'],
  ['levitation-cant-stop-rompe',"Levitation to Can't Stop x Rompe"],
  ['i-know-you-want-me-chandelier','I Know You Want Me x Chandelier']
]);

const PLAN_CENTS = Object.freeze({standard:1500,pro:2500});
const PRO_SLUGS = Object.freeze(['routine-03','routine-05','call-me-maybe-poker-face','yeah-la-vida-es-un-carnaval']);
const allowedTiers = slug => PRO_SLUGS.includes(slug) ? ['legacy','pro'] : ['legacy','standard','pro'];
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

function createStandard(settings, { pool, files, getDriveToken, fetchImpl = fetch, driveFetch = fetch, reply, packManifest, adminEmail }) {
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
      tier: row?.tier || null,
      cancellable: Boolean(row && !row.cancelled_at),
      pending: Boolean(row && !row.cancelled_at && !row.paid_until),
      cancelled: Boolean(row?.cancelled_at)
    });
  }
  async function checkout(res, user, consent, tier = 'standard') {
    if (!Object.hasOwn(PLAN_CENTS, tier)) return reply(res, 400, {error:'Choose Standard or Pro.'});
    const amount = uahKopiykas(PLAN_CENTS[tier], USD_UAH_RATE);
    if (consent !== true || !user.email_verified_at) return reply(res, 400, { error: 'Verify your email and confirm the recurring payment terms.' });
    const result = await locked(user.id, async db => {
      let row = await latest(db, user.id);
      if (row && !row.cancelled_at) {
        if (!row.paid_until && +new Date(row.checkout_expires_at) > Date.now() && (!row.provider_status || ['created','pending'].includes(row.provider_status))) {
          if ((row.tier || 'legacy') !== tier) return {status:409,data:{error:'Cancel the pending subscription in your account before selecting another plan.'}};
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
        amount, ccy: 980, interval: '1m', validity: VALIDITY,
        redirectUrl: webOrigin.origin + '/price/?subscription=return#standard-plan',
        webHookUrls: { chargeUrl: callbackUrl, statusUrl: callbackUrl }
      }, 'POST');
      if (!providerPattern.test(created?.subscriptionId || '') || !isTrustedCheckoutUrl(created.pageUrl)) {
        throw Object.assign(Error('Invalid subscription checkout response'), { code: 'STANDARD_CHECKOUT_INVALID' });
      }
      await db.query(`INSERT INTO standard_subscriptions
        (id,customer_id,provider_id,callback_hash,checkout_url,amount_kop,created_at,checkout_expires_at,tier)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, user.id, created.subscriptionId, sha(callback), created.pageUrl, amount, started, new Date(+started + VALIDITY * 1000), tier]);
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
  function fullVideo(slug) {
    if (!/^routine-0[1-6]$/.test(slug)) return null;
    return entries.get(slug)?.find(file=>/\.mp4$/i.test(file.name))||null;
  }
  async function ticket(res, user, slug, media = false) {
    if (!entries.has(slug) || (media&&!fullVideo(slug))) return reply(res, 404, { error: 'Routine not found.' });
    const secret = random();
    const r = await pool.query(`INSERT INTO standard_download_tickets(token_hash,customer_id,routine_slug,expires_at)
      SELECT $1,$2,$3,now()+($6::integer*interval '1 second')
      WHERE ($5::boolean OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=$2 AND paid_until>now() AND tier=ANY($4::text[]))) RETURNING token_hash`,
    [sha(secret), user.id, media?'video:'+slug:slug, allowedTiers(slug), Boolean(adminEmail && user.email===adminEmail && user.email_verified_at), media?1800:60]);
    if (!r.rowCount) return reply(res, 403, { error: 'An active subscription is required.' });
    return reply(res, 200, { url: '/api/v2/standard/'+(media?'video/':'download/')+secret });
  }
  async function download(res, secret) {
    if (!secretPattern.test(secret)) return reply(res, 404, { error: 'Not found.' });
    const r = await pool.query(`DELETE FROM standard_download_tickets AS t WHERE token_hash=$1 AND expires_at>now() AND t.routine_slug NOT LIKE 'video:%'
      AND (EXISTS (SELECT 1 FROM customers c WHERE c.id=t.customer_id AND c.email=$3 AND c.email_verified_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=t.customer_id AND paid_until>now()
        AND (tier IN ('legacy','pro') OR (tier='standard' AND NOT (t.routine_slug=ANY($2::text[]))))))
      RETURNING routine_slug`, [sha(secret),PRO_SLUGS,adminEmail||null]);
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
    const title = routineNames.get(slug) || slug;
    const safeName = title.replace(/[^\x20-\x7e]/g, '').replace(/["\\/]/g, '').trim();
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="' + safeName +
      '.zip"; filename*=UTF-8\'\'' + encodeURIComponent(title + '.zip').replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase()), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    zip.end();
    try { await pipeline(zip.outputStream, res); } catch { res.destroy(); }
  }
  async function video(req, res, secret) {
    if (!secretPattern.test(secret)) return reply(res,404,{error:'Not found.'});
    const range = req.headers.range;
    if (range && !/^bytes=(?:[0-9]{1,15}-[0-9]{0,15}|-[0-9]{1,15})$/.test(range)) {
      return reply(res,416,{error:'Invalid video range.'});
    }
    // Video tickets can serve multiple byte ranges, but each request rechecks access.
    const r = await pool.query(`SELECT substring(t.routine_slug from 7) AS slug
      FROM standard_download_tickets t
      WHERE t.token_hash=$1 AND t.expires_at>now() AND t.routine_slug LIKE 'video:%'
      AND (EXISTS (SELECT 1 FROM customers c WHERE c.id=t.customer_id AND c.email=$3 AND c.email_verified_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=t.customer_id AND paid_until>now()
          AND (tier IN ('legacy','pro') OR (tier='standard' AND NOT (substring(t.routine_slug from 7)=ANY($2::text[]))))))`,
    [sha(secret),PRO_SLUGS,adminEmail||null]);
    const file = r.rows[0] && fullVideo(r.rows[0].slug);
    if (!file) return reply(res,404,{error:'Video unavailable.'});
    const accessToken=await getDriveToken();
    if(!accessToken)throw Error('Drive authorization unavailable');
    const abort = new AbortController();
    res.once('close',()=>abort.abort());
    const upstream = await driveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.fileId)+'?alt=media',{
      method:req.method,
      headers:{Authorization:'Bearer '+accessToken,...(range?{Range:range}:{})},
      signal:abort.signal,redirect:'error'
    });
    if(upstream.status===416){
      const total=upstream.headers.get('content-range');
      if(total&&/^bytes \*\/[0-9]+$/.test(total))res.setHeader('Content-Range',total);
      await upstream.body?.cancel();return reply(res,416,{error:'Video range unavailable.'});
    }
    if(![200,206].includes(upstream.status)||(!upstream.body&&req.method!=='HEAD')){
      await upstream.body?.cancel();return reply(res,502,{error:'Video temporarily unavailable.'});
    }
    const headers={'Content-Type':'video/mp4','Cache-Control':'private, no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    for(const name of ['content-length','content-range']){
      const value=upstream.headers.get(name);if(value)headers[name]=value;
    }
    res.writeHead(upstream.status,headers);
    if(req.method==='HEAD')return res.end();
    try{await pipeline(Readable.fromWeb(upstream.body),res);}catch{res.destroy();}
  }
  function cleanup() {
    return pool.query('DELETE FROM standard_download_tickets WHERE expires_at <= now()');
  }
  return { status, checkout, cancel, callback, ticket, download, video, cleanup, catalog: {
    slugs: [...entries.keys()],
    proSlugs: PRO_SLUGS.filter(slug=>entries.has(slug)),
    plans: Object.fromEntries(Object.entries(PLAN_CENTS).map(([tier,priceCents])=>[tier,{priceCents,amountKop:uahKopiykas(priceCents,USD_UAH_RATE)}]))
  } };
}
module.exports = { createStandard, catalogFiles, interpretStatus, paidThrough };
