const fs = require('fs/promises');
const path = require('path');

const origin = 'https://mukvik-routine-pack.mukvik.chatgpt.site';
const token = process.env.SITES_BYPASS_TOKEN;
const files = require('./config/site-assets.json').filter(file => file !== 'store-account.js');
// Checkout and password-account logic is kept in GitHub; do not overwrite it from the Sites snapshot.
const storefrontRevision = `sites-v81-video-only-hero-${Date.now()}`;

if (!token) throw new Error('SITES_BYPASS_TOKEN is required during the Railway build');

async function download(relativePath) {
  const response = await fetch(`${origin}/${relativePath}?storefront_revision=${storefrontRevision}`, {
    headers: { 'OAI-Sites-Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Failed to download ${relativePath}: HTTP ${response.status}`);
  const destination = path.join(__dirname, 'web', relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  let bytes = Buffer.from(await response.arrayBuffer());
  // Keep the hero video, with no package illustration or visible pause control.
  // Retain the hidden button node because the video playback script uses it.
  if (relativePath === 'depth.css') {
    bytes = Buffer.concat([bytes, Buffer.from('\n.rp-main .rp-hero-product,.rp-main .rp-depth-scene{display:none!important}\n')]);
  }
  if (relativePath === 'video-background.css') {
    bytes = Buffer.concat([bytes, Buffer.from('\n.rp-main .rp-hero>.rp-background-toggle{display:none!important}\n')]);
  }

  if (relativePath === 'routines/index.html') {
    const html = bytes.toString('utf8').replace(
      /(<p class="routine-includes"[^>]*>4 routines · Audio files<\/p>)(<div class="bundle-offer">)/,
      '$2$1'
    );
    bytes = Buffer.from(html);
  }
  if (relativePath === 'catalog.css') {
    bytes = Buffer.concat([bytes, Buffer.from('\nbody[data-page="routines"] .bundle-offer{align-items:center;justify-content:center;text-align:center}\n')]);
  }

  if (relativePath === 'catalog.css') {
    bytes = Buffer.concat([bytes, Buffer.from('\nbody .rp-main .rp-pack-hero{grid-template-columns:minmax(0,1fr);text-align:center}body .rp-main .rp-pack-hero>div:not(.rp-depth-scene){width:100%;align-items:center;justify-self:center}body .rp-main .rp-pack-hero h1,body .rp-main .rp-pack-hero .rp-lead{margin-inline:auto}body .rp-main .rp-pack-hero .rp-actions{justify-content:center}body .rp-main .rp-hero-product,body .rp-main .rp-depth-scene,body .rp-main .rp-pack-hero>img{display:none!important}\n')]);
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(
      /href="\/(catalog|depth)\.css(?:\?[^"]*)?"/g,
      'href="/$1.css?v=20261023-centered-no-package"'
    ));
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/src="\/store-account\.js(?:\?[^"]*)?"/g,'src="/store-account.js?v=payment-alerts-20261024"'));
  }
  await fs.writeFile(destination, bytes);
  console.log(`Downloaded ${relativePath}`);
}

(async()=>{let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<files.length){const file=files[next++];await download(file);}}));await require('./scripts/download-drive-preview').downloadDrivePreview(process.env,{save:async(name,bytes)=>{const destination=path.join(__dirname,'web','assets','videos',name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);console.log('Downloaded public preview asset: '+name);}});await require('./scripts/import-free-routines').importFreeRoutines(process.env);})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

