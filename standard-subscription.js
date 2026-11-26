'use strict';

const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { USD_UAH_RATE, uahKopiykas, isTrustedCheckoutUrl } = require('./monobank');
const path = require('node:path');
const fs = require('node:fs');
const { isRoutineAudio } = require('./routine-audio');
const localArchives = new Map([['get-right-x-just-a-lil-bit','Get Right x Just a Lil Bit.zip']]);
const manifest = require('./config/standard-pack-files.json');
const routinePaths = require('./config/routine-paths.json');
const importedMedia = require('./config/routine-media.json');
const addedRoutines = importedMedia.filter(routine => routine.files);
const privateVideoSlugs = new Set(importedMedia.map(routine => routine.slug));
const routineNames = new Map([
  ...routinePaths.map(routine => [routine.id, routine.title]),
  ...addedRoutines.map(routine => [routine.slug, routine.title]),
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
const FREE_PACK_SLUGS = Object.freeze(['routine-04','routine-06']);
const PRO_SLUGS = Object.freeze(['routine-03','routine-05','call-me-maybe-poker-face',
  ...addedRoutines.filter(routine => routine.tier === 'pro').map(routine => routine.slug)]);
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
  for (const {slug, files} of addedRoutines) entries.set(slug, files);
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
  const periodStart = paidUntil && (data.summary.totalPaid === 1
    ? new Date(started) : paidThrough(data.startDate, data.summary.totalPaid - 1));
  return { paidUntil, periodStart, status: data.status.slice(0, 40), cancelled: /^(cancelled|canceled|expired|invalidated)$/i.test(data.status) };
}

function createStandard(settings, { pool, files, getDriveToken, fetchImpl = fetch, invoiceFetch = fetch, driveFetch = fetch, reply, packManifest, adminEmail, archiveRoot = path.join(__dirname,'web','downloads'), privateVideoRoot = path.join(__dirname,'private-routine-videos') }) {
  if (settings.STANDARD_SUBSCRIPTIONS_ENABLED === 'false' || !settings.MONOBANK_SUBSCRIPTION_TOKEN) return null;
  const entries = catalogFiles(files, packManifest);
  const publicOrigin = new URL(settings.PUBLIC_ORIGIN);
  const webOrigin = new URL(settings.WEB_ORIGIN);
  if (publicOrigin.protocol !== 'https:' || webOrigin.protocol !== 'https:') throw Error('Subscription checkout requires HTTPS');
  const upgradeEnabled = Boolean(settings.MONOBANK_TOKEN);
  async function invoiceApi(operation, payload) {
    const endpoint = new URL('https://api.monobank.ua/api/merchant/invoice/' + operation);
    if (operation === 'status') endpoint.searchParams.set('invoiceId', payload);
    const response = await invoiceFetch(endpoint, {
      method: operation === 'create' ? 'POST' : 'GET',
      headers: { 'X-Token': settings.MONOBANK_TOKEN, 'Content-Type': 'application/json' },
      body: operation === 'create' ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(12000), redirect: 'error'
    });
    if (!response.ok) throw Error('Monobank upgrade payment is temporarily unavailable.');
    return response.json();
  }
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
    const firstPurchase = parsed.paidUntil && !row.first_paid_at && !row.paid_until;
    const r = await db.query(`UPDATE standard_subscriptions SET paid_until=$2,provider_status=$3,checked_at=now(),
      first_paid_at=CASE WHEN $2::timestamptz IS NOT NULL THEN COALESCE(first_paid_at,now()) ELSE first_paid_at END,
      cancelled_at=CASE WHEN $4 THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END, period_start=$5 WHERE id=$1 RETURNING *`,
      [row.id, parsed.paidUntil, parsed.status, parsed.cancelled, parsed.periodStart]);
    if (firstPurchase) {
      await db.query(`INSERT INTO customer_activity(customer_id,kind,payload)
        VALUES ($1,'subscription_paid',$2::jsonb) ON CONFLICT DO NOTHING`, [
        row.customer_id, JSON.stringify({
          subscription_id:row.id, tier:row.tier, amount_kop:row.amount_kop, paid_until:parsed.paidUntil
        })
      ]);
    }
    return r.rows[0];
  }
  function upgradeQuote(row, now = Date.now()) {
    const end = +new Date(row?.paid_until);
    const start = +new Date(row?.period_start);
    if (!upgradeEnabled || row?.tier !== 'standard' || !row.period_start ||
        +new Date(row.ultra_until) > now || end - now < 120000 || end <= start) return null;
    const differenceCents = PLAN_CENTS.pro - PLAN_CENTS.standard;
    const amountCents = Math.ceil(differenceCents * Math.min(1, (end - now) / (end - start)));
    return { amountCents, amountKop: uahKopiykas(amountCents, USD_UAH_RATE), until: row.paid_until };
  }
  async function reconcileUpgrade(db, invoice) {
    const bank = await invoiceApi('status', invoice.invoice_id);
    if (bank.invoiceId !== invoice.invoice_id || bank.amount !== invoice.amount_kop || bank.ccy !== 980) {
      throw Error('Unexpected Monobank upgrade payment details.');
    }
    if (!['success','failure','expired','reversed'].includes(bank.status)) return;
    if (bank.status === 'success' && bank.finalAmount !== undefined && bank.finalAmount !== invoice.amount_kop) {
      throw Error('Unexpected Monobank upgrade payment amount.');
    }
    await db.query('UPDATE standard_upgrade_invoices SET status=$2 WHERE id=$1', [invoice.id, bank.status]);
    if (bank.status === 'success') {
      await db.query('UPDATE standard_subscriptions SET ultra_until=$2 WHERE id=$1 AND (ultra_until IS NULL OR ultra_until<$2)',
        [invoice.subscription_id, invoice.period_end]);
    }
    if (bank.status === 'reversed') {
      await db.query('UPDATE standard_subscriptions SET ultra_until=NULL WHERE id=$1 AND ultra_until=$2',
        [invoice.subscription_id, invoice.period_end]);
    }
  }
  async function upgrade(res, user, maxAmountKop) {
    if (!upgradeEnabled || !user.email_verified_at) return reply(res, 403, { error: 'Upgrade is unavailable.' });
    if (!Number.isSafeInteger(maxAmountKop) || maxAmountKop < 1) return reply(res,400,{error:'Confirm the upgrade amount.'});
    const result = await locked(user.id, async db => {
      let row = await latest(db,user.id);
      if (!row || row.tier !== 'standard') return {status:409, data:{error:'An active Pro subscription is required.'}};
      row = await reconcile(db,row);
      const {rows:[pending]} = await db.query(`SELECT * FROM standard_upgrade_invoices
        WHERE subscription_id=$1 AND period_end=$2 AND status='created'`, [row.id,row.paid_until]);
      if (pending) {
        await reconcileUpgrade(db,pending);
        const {rows:[updated]} = await db.query('SELECT status FROM standard_upgrade_invoices WHERE id=$1',[pending.id]);
        if (updated.status === 'created' && pending.amount_kop <= maxAmountKop) return {status:200,data:{checkoutUrl:pending.checkout_url}};
        if (updated.status === 'created') return {status:409,data:{error:'Refresh to confirm the existing upgrade amount.'}};
        if (updated.status === 'success') return {status:200,data:{active:true}};
      }
      const quote = upgradeQuote(row);
      if (!quote) return {status:409,data:{error:'This paid period cannot be upgraded.'}};
      if (quote.amountKop > maxAmountKop) return {status:409,data:{error:'Refresh to confirm the current upgrade amount.'}};
      const id = crypto.randomUUID();
      const created = await invoiceApi('create', {
        amount:quote.amountKop, ccy:980, paymentType:'debit',
        validity:Math.min(1800,Math.floor((+new Date(quote.until)-Date.now())/1000)),
        redirectUrl:webOrigin.origin+'/?account=1&upgrade=return',
        webHookUrl:publicOrigin.origin+'/api/v2/standard/upgrade-callback/'+id,
        merchantPaymInfo:{reference:id,destination:'MUKVIK Routine Pack — Ultra upgrade',customerEmails:[user.email]}
      });
      if (!/^[\w-]{5,128}$/.test(created?.invoiceId || '') || !isTrustedCheckoutUrl(created.pageUrl)) {
        throw Error('Unexpected Monobank upgrade checkout link.');
      }
      await db.query(`INSERT INTO standard_upgrade_invoices(id,subscription_id,period_end,amount_kop,invoice_id,checkout_url)
        VALUES($1,$2,$3,$4,$5,$6)`, [id,row.id,quote.until,quote.amountKop,created.invoiceId,created.pageUrl]);
      return {status:201,data:{checkoutUrl:created.pageUrl}};
    });
    return reply(res,result.status,result.data);
  }
  async function upgradeCallback(res,id) {
    if (!upgradeEnabled) return reply(res,404,{error:'Not found.'});
    const {rows:[owner]} = await pool.query(`SELECT s.customer_id FROM standard_upgrade_invoices i
      JOIN standard_subscriptions s ON s.id=i.subscription_id WHERE i.id=$1`,[id]);
    if (!owner) return reply(res,404,{error:'Not found.'});
    await locked(owner.customer_id,async db=>{
      const {rows:[invoice]} = await db.query("SELECT * FROM standard_upgrade_invoices WHERE id=$1 AND status IN ('created','success')",[id]);
      if (invoice) await reconcileUpgrade(db,invoice);
    });
    return reply(res,200,{ok:true});
  }
  async function chooseNext(res,user,tier) {
    if (!Object.hasOwn(PLAN_CENTS,tier) || !user.email_verified_at) return reply(res,400,{error:'Choose Pro or Ultra.'});
    const saved = await locked(user.id,async db=>{
      let row = await latest(db,user.id);
      if (!row?.paid_until || +new Date(row.paid_until)<=Date.now()) return false;
      if (!row.cancelled_at) {
        await api('edit',{subscriptionId:row.provider_id,action:'cancel'},'POST');
      }
      await db.query('UPDATE standard_subscriptions SET next_tier=$2,cancelled_at=COALESCE(cancelled_at,now()) WHERE id=$1',[row.id,tier]);
      return true;
    });
    if (!saved) return reply(res,409,{error:'Your paid period has ended. Choose your next plan on the pricing page.'});
    return status(res,user);
  }
  async function status(res, user, refresh = false, cached = false) {
    let row = await latest(pool, user.id);
    if (!cached && row && ((upgradeEnabled && row.paid_until && !row.period_start) || !row.checked_at || Date.now() - +new Date(row.checked_at) > (refresh ? 5000 : 60000))) {
      row = await locked(user.id, async db => {
        const current = await latest(db, user.id);
        if ((!upgradeEnabled || !current.paid_until || current.period_start) && current.checked_at && Date.now() - +new Date(current.checked_at) < (refresh ? 5000 : 60000)) return current;
        return reconcile(db, current);
      }).catch(e => { console.error('Standard status unavailable:', e.code || e.name); return row; });
    }
    if (refresh && upgradeEnabled && row?.paid_until) {
      row = await locked(user.id,async db=>{
        const current = await latest(db,user.id);
        const {rows:[invoice]} = await db.query(`SELECT * FROM standard_upgrade_invoices
          WHERE subscription_id=$1 AND period_end=$2 AND status='created'`,[current.id,current.paid_until]);
        if (invoice) await reconcileUpgrade(db,invoice);
        return latest(db,user.id);
      }).catch(()=>row);
    }
    const quote = upgradeQuote(row);
    if (quote) {
      const {rows:[pending]} = await pool.query(`SELECT amount_kop FROM standard_upgrade_invoices
        WHERE subscription_id=$1 AND period_end=$2 AND status='created'`,[row.id,row.paid_until]);
      if (pending) {
        quote.amountKop = pending.amount_kop;
        quote.amountCents = Math.round(pending.amount_kop / USD_UAH_RATE);
      }
    }
    return reply(res, 200, {
      active: Boolean(row?.paid_until && +new Date(row.paid_until) > Date.now()),
      paidUntil: row?.paid_until || null,
      tier: +new Date(row?.ultra_until) > Date.now() ? 'pro' : row?.tier || null,
      baseTier: row?.tier || null,
      nextTier: row?.next_tier || null,
      upgrade: quote,
      ultraUntil: row?.ultra_until || null,
      cancellable: Boolean(row && !row.cancelled_at),
      pending: Boolean(row && !row.cancelled_at && !row.paid_until),
      cancelled: Boolean(row?.cancelled_at)
    });
  }
  async function checkout(res, user, consent, tier = 'standard') {
    if (!Object.hasOwn(PLAN_CENTS, tier)) return reply(res, 400, {error:'Choose Pro or Ultra.'});
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
    if (privateVideoSlugs.has(slug)) return { local: path.join(privateVideoRoot, slug + '.mp4') };
    if (!/^routine-0[1-6]$/.test(slug)) return null;
    return entries.get(slug)?.find(file=>/\.mp4$/i.test(file.name))||null;
  }
  async function ticket(res, user, slug, media = false) {
    if ((!entries.has(slug) && !localArchives.has(slug)) || (media&&!fullVideo(slug))) return reply(res, 404, { error: 'Routine not found.' });
    const secret = random();
    const r = await pool.query(`INSERT INTO standard_download_tickets(token_hash,customer_id,routine_slug,expires_at)
      SELECT $1,$2,$3,now()+($6::integer*interval '1 second')
      WHERE ($5::boolean OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=$2 AND paid_until>now() AND (tier=ANY($4::text[]) OR (ultra_until>now() AND 'pro'=ANY($4::text[]))))) RETURNING token_hash`,
    [sha(secret), user.id, media?'video:'+slug:slug, media?['legacy','standard','pro']:allowedTiers(slug), Boolean(user.email_verified_at && (FREE_PACK_SLUGS.includes(slug) || (adminEmail && user.email===adminEmail))), media?1800:60]);
    if (!r.rowCount) return reply(res, 403, { error: 'An active subscription is required.' });
    return reply(res, 200, { url: '/api/v2/standard/'+(media?'video/':'download/')+secret });
  }
  async function libraryTicket(res, user) {
    const secret = random();
    const {rows} = await pool.query(`INSERT INTO standard_download_tickets(token_hash,customer_id,routine_slug,expires_at)
      SELECT $1,$2,'video:library',now()+interval '25 minutes'
      WHERE $3::boolean OR EXISTS (SELECT 1 FROM standard_subscriptions
        WHERE customer_id=$2 AND paid_until>now() AND tier IN ('legacy','standard','pro'))
      RETURNING expires_at`,[sha(secret),user.id,Boolean(user.email_verified_at && adminEmail && user.email===adminEmail)]);
    if (!rows.length) return reply(res,403,{error:'An active subscription is required.'});
    return reply(res,200,{url:'/api/v2/standard/video/'+secret,expiresAt:rows[0].expires_at});
  }
  async function download(res, secret) {
    if (!secretPattern.test(secret)) return reply(res, 404, { error: 'Not found.' });
    const r = await pool.query(`DELETE FROM standard_download_tickets AS t WHERE token_hash=$1 AND expires_at>now() AND t.routine_slug NOT LIKE 'video:%'
      AND (EXISTS (SELECT 1 FROM customers c WHERE c.id=t.customer_id AND (c.email=$3 OR t.routine_slug=ANY($4::text[])) AND c.email_verified_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=t.customer_id AND paid_until>now()
        AND (ultra_until>now() OR tier IN ('legacy','pro') OR (tier='standard' AND NOT (t.routine_slug=ANY($2::text[]))))))
      RETURNING routine_slug`, [sha(secret),PRO_SLUGS,adminEmail||null,FREE_PACK_SLUGS]);
    if (!r.rowCount) return reply(res, 410, { error: 'Download link expired or already used.' });
    return streamRoutine(res, r.rows[0].routine_slug);
  }
  async function downloadFreePack(res, slug) {
    if (!FREE_PACK_SLUGS.includes(slug)) return reply(res,404,{error:'Routine not found.'});
    return streamRoutine(res, slug);
  }
  async function streamRoutine(res, slug) {
    const list = entries.get(slug)?.filter(file => isRoutineAudio(file.name));
    if (localArchives.has(slug)) {
      const filename=path.join(archiveRoot,slug+'.zip');
      let stat;
      try { stat=await fs.promises.stat(filename); } catch { return reply(res,503,{error:'File unavailable.'}); }
      if(!stat.isFile())return reply(res,503,{error:'File unavailable.'});
      res.writeHead(200,{'Content-Type':'application/zip','Content-Length':stat.size,'Content-Disposition':'attachment; filename="'+localArchives.get(slug)+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      try { await pipeline(fs.createReadStream(filename),res); } catch { res.destroy(); }
      return;
    }
    if (!list?.length) return reply(res, 404, { error: 'Routine not found.' });
    const driveToken = await getDriveToken();
    if (!driveToken) throw Error('Drive authorization unavailable');
    const { ZipFile } = require('yazl');
    const zip = new ZipFile(), abort = new AbortController();
    res.once('close', () => abort.abort());
    for (const file of list) {
      zip.addReadStreamLazy(file.name, { compress: false }, done => {
        driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.fileId) + '?alt=media&supportsAllDrives=true', {
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
  async function video(req, res, secret, poster = false, librarySlug = null) {
    if (!secretPattern.test(secret)) return reply(res,404,{error:'Not found.'});
    const range = req.headers.range;
    if (range && !/^bytes=(?:[0-9]{1,15}-[0-9]{0,15}|-[0-9]{1,15})$/.test(range)) {
      return reply(res,416,{error:'Invalid video range.'});
    }
    // Video tickets can serve multiple byte ranges, but each request rechecks access.
    const r = await pool.query(`SELECT CASE WHEN t.routine_slug='video:library' THEN $4 ELSE substring(t.routine_slug from 7) END AS slug
      FROM standard_download_tickets t
      WHERE t.token_hash=$1 AND t.expires_at>now() AND t.routine_slug LIKE 'video:%'
      AND ((t.routine_slug='video:library')=($4::text IS NOT NULL))
      AND (EXISTS (SELECT 1 FROM customers c WHERE c.id=t.customer_id AND (c.email=$2 OR substring(t.routine_slug from 7)=ANY($3::text[])) AND c.email_verified_at IS NOT NULL)
        OR EXISTS (SELECT 1 FROM standard_subscriptions WHERE customer_id=t.customer_id AND paid_until>now()
          AND tier IN ('legacy','standard','pro')))`,
    [sha(secret),adminEmail||null,FREE_PACK_SLUGS,librarySlug]);
    const file = r.rows[0] && fullVideo(r.rows[0].slug);
    if (!file) return reply(res,404,{error:'Video unavailable.'});
    if (poster) {
      const filename = file.local ? file.local.replace(/\.mp4$/, '.jpg') : /^routine-0[1-6]$/.test(r.rows[0].slug) ? path.join(privateVideoRoot,r.rows[0].slug+'.jpg') : null;
      const stat = filename && await fs.promises.stat(filename).catch(() => null);
      if (!stat?.isFile()) return reply(res,404,{error:'Poster unavailable.'});
      res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':stat.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')return res.end();
      try { await pipeline(fs.createReadStream(filename),res); } catch { res.destroy(); }
      return;
    }
    if (file.local) {
      const stat = await fs.promises.stat(file.local).catch(() => null);
      if (!stat?.isFile() || !stat.size) return reply(res,404,{error:'Video unavailable.'});
      const size = stat.size;
      const headers = {'Content-Type':'video/mp4','Cache-Control':'private, no-store','Accept-Ranges':'bytes','Content-Disposition':'inline','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
      const [, first, last] = range?.match(/^bytes=(\d*)-(\d*)$/) || [];
      const start = range && !first ? Math.max(0, size - Number(last)) : Number(first || 0);
      const end = range && first && last ? Math.min(size - 1, Number(last)) : size - 1;
      if (start > end || start >= size) return res.writeHead(416, {...headers,'Content-Range': 'bytes */' + size}).end();
      if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
      res.writeHead(range ? 206 : 200, {...headers,'Content-Length': end - start + 1});
      if (req.method === 'HEAD') return res.end();
      try { await pipeline(fs.createReadStream(file.local,{start,end}),res); } catch { res.destroy(); }
      return;
    }
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
  return { status, checkout, cancel, callback, upgrade, upgradeCallback, chooseNext, ticket, libraryTicket, download, downloadFreePack, video, cleanup, catalog: {
    slugs: [...entries.keys(), ...localArchives.keys()],
    freeSlugs: FREE_PACK_SLUGS.filter(slug=>entries.has(slug)),
    videoSlugs: [...entries.keys()].filter(slug => fullVideo(slug)),
    posterSlugs: [...entries.keys()].filter(slug=>privateVideoSlugs.has(slug)||(/^routine-0[1-6]$/.test(slug)&&fullVideo(slug))),
    proSlugs: PRO_SLUGS.filter(slug=>entries.has(slug)),
    plans: Object.fromEntries(Object.entries(PLAN_CENTS).map(([tier,priceCents])=>[tier,{priceCents,amountKop:uahKopiykas(priceCents,USD_UAH_RATE)}]))
  } };
}
module.exports = { createStandard, catalogFiles, interpretStatus, paidThrough, FREE_PACK_SLUGS };
