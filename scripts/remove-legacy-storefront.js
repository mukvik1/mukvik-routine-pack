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

async function cleanStorefrontPages(directory) {
 for (const item of await fs.readdir(directory, { withFileTypes:true })) {
  const file = path.join(directory, item.name);
  if (item.isDirectory() && item.name !== 'assets' && item.name !== 'downloads') await cleanStorefrontPages(file);
  if (!item.isFile() || !item.name.endsWith('.html')) continue;
  const original = await fs.readFile(file, 'utf8');
  const cleaned = removeLegacyStorefront(original);
  if (original !== cleaned) await fs.writeFile(file, cleaned);
 }
}
module.exports = { cleanStorefrontPages, removeLegacyStorefront };
