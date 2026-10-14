'use strict';
const crypto = require('node:crypto');

const API = 'https://api.monobank.ua';
const NBU = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew?valcode=USD&json';
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALIDITY_SECONDS = 3600;
const CHECKOUT_HOSTS = new Set(['pay.mbnk.biz', 'pay.monobank.ua', 'pay.monobank.com.ua']);

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(data));
}

function uahKopiykas(usdCents, rate) {
  if (!Number.isSafeInteger(usdCents) || usdCents <= 0 || !Number.isFinite(rate) || rate < 1 || rate > 1000) {
    throw new Error('Invalid FX quote');
  }
  const amount = Math.round(usdCents * rate);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid UAH amount');
  return amount;
}

function isTrustedCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && CHECKOUT_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

function verifySignature(rawBytes, base64Signature, base64PublicKey) {
  if (typeof base64Signature !== 'string' || !/^[a-zA-Z0-9+/=]{60,256}$/.test(base64Signature)) return false;
  try {
    const key = crypto.createPublicKey(Buffer.from(base64PublicKey, 'base64').toString('utf8'));
    return crypto.verify('sha256', rawBytes, key, Buffer.from(base64Signature, 'base64'));
  } catch { return false; }
}

function createMonobank(settings, deps) {
  if (settings.MONOBANK_ENABLED !== 'true') return null;
  if (!settings.MONOBANK_TOKEN || !settings.PUBLIC_ORIGIN || !deps?.pool) {
    throw new Error('Monobank config missing: MONOBANK_TOKEN, PUBLIC_ORIGIN or database');
  }
  const siteOrigin = 'https://routinepack.download';
  const callbackBase = new URL(settings.PUBLIC_ORIGIN);
  if (callbackBase.protocol !== 'https:') throw new Error('Monobank callback requires HTTPS');
  const webhookUrl = callbackBase.origin + '/api/v2/monobank/webhook';
  const {pool} = deps;
  const fetchImpl = deps.fetch || fetch;
  let publicKey = null;
  let rateCache = null;

  async function api(path, options = {}) {
    const result = await fetchImpl(API + path, {
      ...options,
      headers: {'X-Token': settings.MONOBANK_TOKEN, 'Content-Type': 'application/json', ...(options.headers || {})},
      signal: AbortSignal.timeout(12000)
    });
    if (!result.ok) throw new Error('Monobank API returned HTTP ' + result.status);
    return result.json();
  }

  async function rateUsdUah() {
    if (rateCache && Date.now() < rateCache.until) return rateCache.rate;
    const response = await fetchImpl(NBU, {signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('NBU rate unavailable');
    const data = await response.json();
    const item = Array.isArray(data) ? data.find(x => x.cc === 'USD') : null;
    const rate = Number(item?.rate);
    const parts = String(item?.exchangedate || '').split('.');
    const recorded = parts.length === 3 ? Date.parse(parts[2] + '-' + parts[1] + '-' + parts[0] + 'T00:00:00Z') : NaN;
    if (!Number.isFinite(recorded) || Date.now() - recorded > 7 * 86400000 || recorded - Date.now() > 86400000) {
      throw new Error('NBU currency rate date invalid');
    }
    uahKopiykas(100, rate);
    rateCache = {rate, until: Date.now() + 10 * 60000};
    return rate;
  }

  async function publicKeyForWebhooks(refresh = false) {
    if (publicKey && !refresh) return publicKey;
    const data = await api('/api/merchant/pubkey');
    if (!data?.key || typeof data.key !== 'string') throw new Error('Monobank public key unavailable');
    publicKey = data.key;
    return publicKey;
  }

  async function checkout(res, orderId, customer, consent) {
    if (consent !== true) return reply(res, 400, {error: 'Confirm immediate digital delivery and review the terms before payment.'});
    if (!ORDER_ID.test(orderId)) return reply(res, 404, {error: 'Order not found.'});
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        'SELECT id,status,total_cents FROM orders WHERE id=$1 AND customer_id=$2 FOR UPDATE',
        [orderId, customer.id]
      );
      if (!result.rowCount) { await db.query('ROLLBACK'); return reply(res, 404, {error: 'Order not found.'}); }
      if (result.rows[0].status !== 'awaiting_manual_review') {
        await db.query('ROLLBACK');
        return reply(res, 409, {error: 'Order is not awaiting payment.'});
      }
      await db.query('UPDATE orders SET digital_delivery_consent_at=COALESCE(digital_delivery_consent_at,now()) WHERE id=$1',[orderId]);
      const previous = await db.query(
        'SELECT page_url,amount_kop,rate_uah,expires_at,status FROM monobank_invoices WHERE order_id=$1 ORDER BY id DESC LIMIT 1',
        [orderId]
      );
      if (previous.rowCount && ['created','processing'].includes(previous.rows[0].status) && new Date(previous.rows[0].expires_at).getTime() > Date.now()) {
        await db.query('COMMIT');
        const p = previous.rows[0];
        return reply(res, 200, {pageUrl: p.page_url, amountKop: p.amount_kop, currency: 'UAH', usdCents: result.rows[0].total_cents, rate: Number(p.rate_uah), expiresAt: p.expires_at});
      }
      const rate = await rateUsdUah();
      const amountKop = uahKopiykas(result.rows[0].total_cents, rate);
      const invoice = await api('/api/merchant/invoice/create', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountKop, ccy: 980,
          merchantPaymInfo: {
            reference: orderId,
            destination: 'MUKVIK Routine Pack digital products',
            customerEmails: [customer.email]
          },
          redirectUrl: siteOrigin + '/?monoOrder=' + encodeURIComponent(orderId),
          webHookUrl: webhookUrl,
          validity: VALIDITY_SECONDS,
          paymentType: 'debit'
        })
      });
      if (typeof invoice.invoiceId !== 'string' || !/^[a-zA-Z0-9_-]{5,128}$/.test(invoice.invoiceId) || !isTrustedCheckoutUrl(invoice.pageUrl)) {
        throw new Error('Monobank returned invalid invoice details');
      }
      const expiresAt = new Date(Date.now() + VALIDITY_SECONDS * 1000);
      await db.query(
        'INSERT INTO monobank_invoices(order_id,invoice_id,page_url,amount_kop,rate_uah,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [orderId,invoice.invoiceId,invoice.pageUrl,amountKop,rate,'created',expiresAt]
      );
      await db.query('COMMIT');
      return reply(res, 200, {pageUrl: invoice.pageUrl, amountKop, currency: 'UAH', usdCents: result.rows[0].total_cents, rate, expiresAt});
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  }

  async function applyPayment(payload) {
    const invoiceId = String(payload.invoiceId || '');
    const status = String(payload.status || '').toLowerCase();
    const reference = String(payload.reference || '');
    const modified = Date.parse(payload.modifiedDate);
    if (!invoiceId || !ORDER_ID.test(reference) || !Number.isFinite(modified)) return false;
    if (!['created','processing','success','failure','reversed','expired'].includes(status)) return false;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        'SELECT i.id,i.order_id,i.amount_kop,i.status,i.modified_at,o.customer_id,o.status AS order_status FROM monobank_invoices i JOIN orders o ON o.id=i.order_id WHERE i.invoice_id=$1 FOR UPDATE OF i,o',
        [invoiceId]
      );
      if (!result.rowCount) { await db.query('ROLLBACK'); return false; }
      const row = result.rows[0];
      if (reference !== row.order_id || payload.ccy !== 980 || payload.amount !== row.amount_kop) {
        await db.query('ROLLBACK');
        return false;
      }
      if (row.modified_at && modified <= new Date(row.modified_at).getTime()) {
        await db.query('COMMIT');
        return true;
      }
      // A late processing notification must never undo an already successful payment.
      if (row.status === 'success' && status !== 'reversed') {
        await db.query('COMMIT');
        return true;
      }
      await db.query('UPDATE monobank_invoices SET status=$2,modified_at=$3 WHERE id=$1',[row.id,status,new Date(modified)]);
      if (status === 'success' && row.order_status === 'awaiting_manual_review') {
        await db.query("UPDATE orders SET status='approved',approved_at=now() WHERE id=$1",[row.order_id]);
        await db.query(
          'INSERT INTO entitlements(order_id,customer_id,product_code) SELECT i.order_id,$2,i.product_code FROM order_items i WHERE i.order_id=$1 ON CONFLICT(order_id,product_code) DO NOTHING',
          [row.order_id,row.customer_id]
        );
        await db.query("INSERT INTO order_events(order_id,event_type) VALUES($1,'monobank_paid')",[row.order_id]);
        await db.query("INSERT INTO notification_outbox(order_id,kind) VALUES($1,'approved') ON CONFLICT(order_id,kind) DO NOTHING",[row.order_id]);
        await db.query("INSERT INTO telegram_notifications(order_id,kind) VALUES($1,'monobank_paid') ON CONFLICT(order_id,kind) DO NOTHING",[row.order_id]);
      } else if (status === 'reversed' && row.status === 'success' && row.order_status === 'approved') {
        await db.query("UPDATE orders SET status='refunded' WHERE id=$1",[row.order_id]);
        await db.query("INSERT INTO order_events(order_id,event_type) VALUES($1,'monobank_reversed')",[row.order_id]);
        await db.query("INSERT INTO telegram_notifications(order_id,kind) VALUES($1,'monobank_reversed') ON CONFLICT(order_id,kind) DO NOTHING",[row.order_id]);
      }
      await db.query('COMMIT');
      return true;
    } catch(error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  }

  async function reconcile(res, orderId, customer) {
    if (!ORDER_ID.test(orderId)) return reply(res,404,{error:'Order not found.'});
    const order = await pool.query('SELECT id,status FROM orders WHERE id=$1 AND customer_id=$2',[orderId,customer.id]);
    if (!order.rowCount) return reply(res,404,{error:'Order not found.'});
    const invoice = await pool.query(
      'SELECT invoice_id FROM monobank_invoices WHERE order_id=$1 ORDER BY id DESC LIMIT 1',
      [orderId]
    );
    if (!invoice.rowCount) return reply(res,200,{status:order.rows[0].status});
    if (order.rows[0].status === 'awaiting_manual_review') {
      const state = await api('/api/merchant/invoice/status?invoiceId='+encodeURIComponent(invoice.rows[0].invoice_id));
      await applyPayment(state);
    }
    const refreshed = await pool.query('SELECT status FROM orders WHERE id=$1 AND customer_id=$2',[orderId,customer.id]);
    return reply(res,200,{status:refreshed.rows[0].status});
  }

  async function webhook(req,res) {
    let bytes = 0; const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 65536) return reply(res, 413, {error: 'Payload too large'});
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);
    const signature = req.headers['x-sign'];
    let key = await publicKeyForWebhooks();
    if (!verifySignature(raw,signature,key)) {
      key = await publicKeyForWebhooks(true);
      if (!verifySignature(raw,signature,key)) return reply(res,401,{error:'Invalid signature'});
    }
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); }
    catch { return reply(res,400,{error:'Invalid JSON'}); }
    const accepted = await applyPayment(payload);
    reply(res,accepted ? 200 : 409,{ok:accepted});
  }

  return {checkout,webhook,reconcile};
}

module.exports = {createMonobank,uahKopiykas,isTrustedCheckoutUrl,verifySignature};
