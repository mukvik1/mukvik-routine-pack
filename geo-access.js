'use strict';
const net = require('node:net');
const geoip = require('geoip-country');
const POLICY_VERSION = 'ru-geo-20261027';
const WEBHOOKS = new Set(['/api/v2/telegram/webhook', '/api/v2/monobank/webhook', '/api/nowpayments-ipn']);
const MESSAGE = 'Routine Pack is not available in your region.';

function clientIp(req, railwayProxy) {
  // Railway's public HTTP edge overwrites X-Real-IP. Do not trust caller-controlled
  // country headers, X-Forwarded-For, form fields, browser language or email domain.
  // Outside Railway, only the connected peer is trusted.
  const value = railwayProxy ? req.headers['x-real-ip'] : req.socket?.remoteAddress;
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  return net.isIP(ip) ? ip : null;
}
function createGeoAccess({ railwayProxy = Boolean(process.env.RAILWAY_ENVIRONMENT_ID), lookup = geoip.lookup } = {}) {
  return function geoAccess(req, res, url) {
    res.setHeader('X-Access-Policy', POLICY_VERSION);
    // These authenticated server callbacks must remain reachable from provider IPs.
    if (req.method === 'POST' && WEBHOOKS.has(url.pathname)) return false;
    const ip = clientIp(req, railwayProxy);
    const country = ip ? lookup(ip)?.country : null;
    if (country !== 'RU') return false;
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' };
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(403, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: MESSAGE, code: 'REGION_UNAVAILABLE' }));
    } else {
      res.writeHead(403, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
      res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Routine Pack — unavailable</title><style>body{margin:0;min-height:100dvh;display:grid;place-content:center;background:#101218;color:#fff;font:16px/1.6 system-ui;padding:24px;box-sizing:border-box}h1{font-size:28px;margin:0 0 12px}p{margin:0;color:#b9c1cf}</style><main><h1>Routine Pack</h1><p>' + MESSAGE + '</p></main></html>');
    }
    return true;
  };
}
module.exports = { createGeoAccess, clientIp, POLICY_VERSION };
