const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, 'web');
const port = process.env.PORT || 3000;
const origin = process.env.PUBLIC_ORIGIN || 'https://mukvik-routine-pack-production.up.railway.app';
const apiKey = process.env.NOWPAYMENTS_API_KEY;
const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
const deliveryUrl = process.env.PRODUCT_DELIVERY_URL;
const cardCheckoutUrl = process.env.CARD_CHECKOUT_URL;
const paymentRefs = new Map();
const paymentLookups = new Map();
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment'
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

function sign(value) {
  return crypto.createHmac('sha256', ipnSecret).update(value).digest('hex');
}

function tokenFor(orderId) {
  return `${orderId}.${sign(orderId)}`;
}

function readOrder(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token) || !ipnSecret) return null;
  const [orderId, signature] = token.split('.');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(orderId), 'hex')) ? orderId : null;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
  return value;
}

async function provider(url, options = {}) {
  const response = await fetch(`https://api.nowpayments.io${url}`, {
    ...options,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`NOWPayments returned HTTP ${response.status}: ${String(data.message || data.code || 'request failed').slice(0, 120)}`);
  return data;
}

const checkouts = new Map();
async function checkout(req, res) {
  if (!apiKey || !ipnSecret || !deliveryUrl) return json(res, 503, { error: 'Checkout is temporarily unavailable. Please try again later.' });
  const ip = (String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0]).slice(0, 100);
  const now = Date.now();
  const recent = (checkouts.get(ip) || []).filter(time => now - time < 60000);
  if (recent.length >= 5) return json(res, 429, { error: 'Please wait a minute before trying again.' });
  recent.push(now);
  checkouts.set(ip, recent);

  const orderId = crypto.randomBytes(16).toString('hex');
  const order = tokenFor(orderId);
  try {
    const invoice = await provider('/v1/invoice', {
      method: 'POST',
      body: JSON.stringify({
        price_amount: 49,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: orderId,
        order_description: 'MUKVIK Routine Pack Volume 1, MP3 + videos',
        ipn_callback_url: `${origin}/api/nowpayments-ipn`,
        success_url: `${origin}/?order=${encodeURIComponent(order)}`,
        cancel_url: `${origin}/#packs`,
        partially_paid_url: `${origin}/?order=${encodeURIComponent(order)}`
      })
    });
    if (!invoice.invoice_url || !/^https:\/\/([a-z0-9-]+\.)?nowpayments\.io\//i.test(invoice.invoice_url)) {
      throw new Error('Unexpected checkout address');
    }
    json(res, 200, { invoiceUrl: invoice.invoice_url });
  } catch (error) {
    console.error('Checkout error:', error.message);
    json(res, 502, { error: 'Could not open checkout. Please try again shortly.' });
  }
}

async function paymentStatus(url, res) {
  const orderId = readOrder(url.searchParams.get('order'));
  if (!orderId) return json(res, 400, { error: 'Invalid order link.' });
  let paymentId = url.searchParams.get('paymentId') || paymentRefs.get(orderId);
  if (!paymentId && apiKey) {
    const lastLookup = paymentLookups.get(orderId) || 0;
    if (Date.now() - lastLookup > 15000) {
      paymentLookups.set(orderId, Date.now());
      try {
        const listing = await provider('/v1/payment?limit=100&page=0&sortBy=created_at&orderBy=desc');
        const payments = Array.isArray(listing) ? listing : (listing.data || listing.payments || []);
        const match = payments.find(item => item.order_id === orderId && /^\d{1,24}$/.test(String(item.payment_id)));
        if (match) {
          paymentId = String(match.payment_id);
          paymentRefs.set(orderId, paymentId);
        }
      } catch (error) {
        console.error('Payment lookup error:', error.message);
      }
    }
  }
  if (!paymentId) return json(res, 200, { status: 'waiting', message: 'Return to the payment page and wait for confirmation. If you have already paid, contact MUKVIK with your payment ID.' });
  if (!/^\d{1,24}$/.test(paymentId)) return json(res, 400, { error: 'Invalid payment ID.' });
  if (!apiKey || !deliveryUrl) return json(res, 503, { error: 'Payment check is temporarily unavailable.' });
  try {
    const payment = await provider(`/v1/payment/${paymentId}`);
    if (payment.order_id !== orderId || Number(payment.price_amount) !== 49 || String(payment.price_currency).toLowerCase() !== 'usd') {
      return json(res, 404, { error: 'Payment does not match this order.' });
    }
    const status = String(payment.payment_status || '').toLowerCase();
    if (status === 'finished') return json(res, 200, { status, deliveryUrl });
    const done = ['failed', 'expired', 'refunded'].includes(status);
    json(res, 200, { status: done ? 'failed' : 'waiting', message: done ? 'The payment was not completed. You can start a new checkout.' : 'Your payment is being confirmed. This page checks again automatically.' });
  } catch (error) {
    console.error('Payment check error:', error.message);
    json(res, 502, { error: 'We could not check the payment yet. Please try again.' });
  }
}

async function ipn(req, res) {
  if (!ipnSecret) return json(res, 503, { error: 'Unavailable' });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) return json(res, 413, { error: 'Payload too large' });
    chunks.push(chunk);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return json(res, 400, { error: 'Invalid JSON' }); }
  const signature = req.headers['x-nowpayments-sig'];
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return json(res, 401, { error: 'Invalid signature' });
  const expected = crypto.createHmac('sha512', ipnSecret.trim()).update(JSON.stringify(sortDeep(payload))).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return json(res, 401, { error: 'Invalid signature' });
  if (typeof payload.order_id === 'string' && /^[a-f0-9]{32}$/.test(payload.order_id) && /^\d{1,24}$/.test(String(payload.payment_id))) {
    paymentRefs.set(payload.order_id, String(payload.payment_id));
  }
  json(res, 200, { ok: true });
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`)) return json(res, 403, { error: 'Forbidden' });
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, { error: 'Not found' });
    const size = stat.size;
    const contentType = types[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=300', 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' };
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    fs.createReadStream(filePath).pipe(res);
  });
}

http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, origin); }
  catch { return json(res, 400, { error: 'Invalid request' }); }
  if (req.method === 'GET' && url.pathname === '/api/payment-options') {
    let cardUrl = null;
    try {
      const candidate = new URL(cardCheckoutUrl);
      if (candidate.protocol === 'https:' && (candidate.hostname === 'patreon.com' || candidate.hostname.endsWith('.patreon.com'))) cardUrl = candidate.href;
    } catch {}
    return json(res, 200, { cardUrl });
  }
  if (req.method === 'POST' && url.pathname === '/api/checkout') return checkout(req, res);
  if (req.method === 'GET' && url.pathname === '/api/payment-status') return paymentStatus(url, res);
  if (req.method === 'POST' && url.pathname === '/api/nowpayments-ipn') return ipn(req, res);
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return json(res, 400, { error: 'Invalid path' }); }
  serveStatic(req, res, pathname);
}).listen(port, () => console.log(`MUKVIK Routine Pack running on ${port}`));
