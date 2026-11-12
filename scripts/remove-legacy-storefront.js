'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function removeLegacyStorefront(html) {
 return html.replace(/<(button|a)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, (markup, tag, attrs) => {
  if (/(?:^|\s)data-(?:cart|buy)(?=\s|=|$)/i.test(attrs) ||
      /\bhref=["'](?:#store-cart|\/packs\/get-the-pack\/?)(?:["'])/i.test(attrs)) return '';
  return markup;
 });
}

function addBrandLockups(html) {
 if (html.includes('rp-brand-pair')) return html;
 let paired=false;
 const output=html.replace(/<img\b[^>]*\bsrc=["']\/assets\/mukvik-logo(?:-transparent)?\.png["'][^>]*>/gi,()=>{
  paired=true;
  return '<span class="rp-brand-pair"><span class="rp-brand-dj"><img src="/assets/dj-tools-logo.webp" width="600" height="240" alt="DJ Tools"></span><span class="rp-brand-mukvik"><img src="/assets/mukvik-logo-transparent.png" width="1254" height="1254" alt="MUKVIK"></span></span>';
 });
 return paired?output.replace('</head>','<link rel="stylesheet" href="/brand-lockup.css?v=1"></head>'):output;
}

async function cleanStorefrontPages(directory) {
 for (const item of await fs.readdir(directory, { withFileTypes:true })) {
  const file = path.join(directory, item.name);
  if (item.isDirectory() && item.name !== 'assets' && item.name !== 'downloads') await cleanStorefrontPages(file);
  if (!item.isFile() || !item.name.endsWith('.html')) continue;
  const original = await fs.readFile(file, 'utf8');
  const cleaned = addBrandLockups(removeLegacyStorefront(original));
  if (original !== cleaned) await fs.writeFile(file, cleaned);
 }
}
module.exports = { cleanStorefrontPages, removeLegacyStorefront, addBrandLockups };
