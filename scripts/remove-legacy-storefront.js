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

function useDjToolsBrand(html) {
 const logo='<img class="rp-dj-brand" src="/assets/dj-tools-logo.webp" width="600" height="240" alt="DJ Tools">';
 const output=html.replace(/<img\b[^>]*\bsrc=["']\/assets\/mukvik-logo(?:-transparent)?\.png["'][^>]*>/gi,logo);
 if(output===html)return html;
 return output.replace(/\sdata-i18n-aria-label="MUKVIK home"/g,'')
  .replace(/aria-label="MUKVIK home"/g,'aria-label="DJ Tools home"')
  .replace('</head>','<link rel="stylesheet" href="/brand-lockup.css?v=2"></head>');
}

async function cleanStorefrontPages(directory) {
 for (const item of await fs.readdir(directory, { withFileTypes:true })) {
  const file = path.join(directory, item.name);
  if (item.isDirectory() && item.name !== 'assets' && item.name !== 'downloads') await cleanStorefrontPages(file);
  if (!item.isFile() || !item.name.endsWith('.html')) continue;
  const original = await fs.readFile(file, 'utf8');
  const cleaned = useDjToolsBrand(removeLegacyStorefront(original));
  if (original !== cleaned) await fs.writeFile(file, cleaned);
 }
}
module.exports = { cleanStorefrontPages, removeLegacyStorefront, useDjToolsBrand };
