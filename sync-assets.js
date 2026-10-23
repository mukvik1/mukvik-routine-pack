const fs = require('fs/promises');
const path = require('path');

const origin = 'https://mukvik-routine-pack.mukvik.chatgpt.site';
const token = process.env.SITES_BYPASS_TOKEN;
const files = require('./config/site-assets.json').filter(file => file !== 'store-account.js');
// Checkout and password-account logic is kept in GitHub; do not overwrite it from the Sites snapshot.
const storefrontRevision = `sites-v81-static-tell-me-why-${Date.now()}`;

if (!token) throw new Error('SITES_BYPASS_TOKEN is required during the Railway build');

async function download(relativePath) {
  const response = await fetch(`${origin}/${relativePath}?storefront_revision=${storefrontRevision}`, {
    headers: { 'OAI-Sites-Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Failed to download ${relativePath}: HTTP ${response.status}`);
  const destination = path.join(__dirname, 'web', relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${relativePath}`);
}

(async()=>{let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<files.length){const file=files[next++];await download(file);}}));await require('./scripts/download-drive-preview').downloadDrivePreview(process.env,{save:async(name,bytes)=>{const destination=path.join(__dirname,'web','assets','videos',name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);console.log('Downloaded public preview asset: '+name);}});await require('./scripts/import-free-routines').importFreeRoutines(process.env);})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
