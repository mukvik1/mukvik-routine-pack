const fs = require('fs/promises');
const path = require('path');

const origin = 'https://mukvik-routine-pack.mukvik.chatgpt.site';
const token = process.env.SITES_BYPASS_TOKEN;
const files = require('./config/site-assets.json').filter(file => !['store-account.js','video-background.js','video-background.css'].includes(file));
// Checkout and password-account logic is kept in GitHub; do not overwrite it from the Sites snapshot.
const storefrontRevision = `sites-v81-video-only-hero-${Date.now()}`;

if (!token) throw new Error('SITES_BYPASS_TOKEN is required during the Railway build');

async function download(relativePath) {
  if (relativePath === 'assets/mukvik-logo.png') {
    // Preserve legacy URLs used by footers, scripts and older cached pages.
    await fs.copyFile(path.join(__dirname,'web','assets','mukvik-logo-transparent.png'),path.join(__dirname,'web',relativePath));
    return;
  }
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
      /href="\/(catalog|depth|video-background)\.css(?:\?[^"]*)?"/g,
      'href="/$1.css?v=20261024-routine-cards"'
    ));
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/src="\/store-account\.js(?:\?[^"]*)?"/g,'src="/store-account.js?v=currency-note-20261024"'));
  }
  if(relativePath.endsWith('.html')){
    bytes=Buffer.from(bytes.toString('utf8').replace(/src="\/video-background\.js(?:\?[^"]*)?"/g,'src="/video-background.js?v=20261024-routine-cards"'));
  }
  if(relativePath.endsWith('.html')) {
    bytes=Buffer.from(bytes.toString('utf8').replaceAll('assets/mukvik-logo.png', 'assets/mukvik-logo-transparent.png'));
  }

  // Keep the storefront concise and the mobile hero close to the navigation.
  if (relativePath === 'index.html') {
    let html = bytes.toString('utf8');
    html = html.replace(/<section class="rp-section">(?:(?!<section)[\s\S])*?One pack\. Six big moments\.(?:(?!<\/section>)[\s\S])*?<\/section>/, '');
    html = html.replace(/<a class="rp-button rp-button-lime" href="#lessons">[\s\S]*?<\/a>/, '<a class="rp-button rp-button-lime" href="/packs/#previews">Watch Packs</a>');
    html = html.replace(/<a class="rp-button rp-button-outline" href="\/packs\/">[\s\S]*?<\/a>/, '<a class="rp-button rp-button-outline" href="/routines/">Explore Routines</a>');
    bytes = Buffer.from(html);
  }
  if (relativePath === 'packs/index.html') {
    bytes = Buffer.from(bytes.toString('utf8')
      .replace(/<section class="rp-pack-hero">[\s\S]*?<\/section>/, '')
      .replace('<section class="rp-pack-layout">', '<section class="rp-pack-layout" id="previews">'));
  }
  if (relativePath === 'catalog.css') {
    bytes = Buffer.concat([bytes, Buffer.from(`
/* Compact mobile introduction and left-aligned brand. */
@media(max-width:760px){
  html body .site-header .logo-wrap{grid-column:1;grid-row:1;justify-self:start!important;margin-inline:0}
  body[data-page="home"] .rp-main .rp-hero{padding:20px 18px 36px!important;min-height:0!important}
  body[data-page="home"] .rp-main .rp-hero-copy{padding-top:0!important;margin-top:0!important}
  body[data-page="home"] .rp-main .rp-hero-copy .rp-kicker{margin-top:0;margin-bottom:12px}
  body[data-page="home"] .rp-main .rp-hero-copy h1{margin-bottom:16px}
  body[data-page="home"] .rp-main .rp-hero-copy .rp-lead{font-size:14px!important;line-height:1.5;max-width:310px;margin-top:0;margin-bottom:20px}
}
body[data-page="packs"] .rp-pack-layout{scroll-margin-top:24px}
`)]);
  }


  if (relativePath === 'routines/index.html') {
    let html = bytes.toString('utf8').replace(/<section class="page-intro">[\s\S]*?<\/section>/, '');
    const bundle = html.match(/<section class="bundle-card">[\s\S]*?<\/section>/);
    if (bundle) {
      const card = bundle[0].replace('<section class="bundle-card">', '<article class="bundle-card">').replace(/<\/section>$/, '</article>');
      html = html.replace(bundle[0], '').replace('<div class="coming-grid individual-grid">', '<div class="coming-grid individual-grid">' + card);
    }
    bytes = Buffer.from(html);
  }
  if (relativePath === 'catalog.css') {
    bytes = Buffer.concat([bytes, Buffer.from(`
/* The audio bundle shares the same catalogue columns as individual routines. */
body[data-page="routines"] .individual-grid>.bundle-card{display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;gap:18px;min-width:0;max-width:100%;margin:0;padding:clamp(20px,3vw,36px);border:0;border-radius:0;grid-column:auto}
body[data-page="routines"] .individual-grid>.bundle-card h2{font-size:clamp(24px,2.5vw,34px)!important;line-height:1.25;margin:0 0 16px}
body[data-page="routines"] .individual-grid>.bundle-card ul{margin:0;padding:0;list-style:none}
body[data-page="routines"] .individual-grid>.bundle-card li{font-size:14px;line-height:1.4;padding:9px 0}
body[data-page="routines"] .individual-grid>.bundle-card .bundle-offer{display:flex;flex-direction:column;gap:12px;margin-top:auto}
body[data-page="routines"] .individual-grid>.bundle-card .routine-includes{margin:0;font-size:13px}
`)]);
  }


  if (relativePath === 'free/index.html') {
    bytes = Buffer.from(bytes.toString('utf8').replace(/<section class="page-intro free-intro">[\s\S]*?<\/section>/, ''));
  }
  if (relativePath.startsWith('free/') && relativePath !== 'free/index.html' && relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(
      '<p data-i18n="Open Instagram, follow MUKVIK, then return here and confirm.">Open Instagram, follow MUKVIK, then return here and confirm.</p>',
      '<p data-follow-question>Follow @mukvik.ofc on Instagram before downloading. Are you already following?</p>'
    ));
  }
  if (relativePath === 'app.js') {
    let js = bytes.toString('utf8');
    // Ask on every routine page, including returning visitors.
    js = js.replace("if (followWall && safeRead(FOLLOW_KEY) === 'confirmed') revealFree();\nelse if (followWall && safeSessionRead(FOLLOW_OPEN_KEY) === 'opened') enableConfirmFollow();",
      "if (followWall) enableConfirmFollow();");
    // Open Instagram only when the visitor explicitly chooses the follow link.
    js = js.replace('    beginFreeFollow();\n    window.location.href = link.href;', '    window.location.href = link.href;');
    js += "\n(() => { const q=document.querySelector('[data-follow-question]');if(!q)return;const update=()=>{q.textContent=document.documentElement.lang==='uk'?'Перед завантаженням підпишіться на @mukvik.ofc в Instagram. Ви вже підписані?':'Follow @mukvik.ofc on Instagram before downloading. Are you already following?';};update();new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});})();\n";
    bytes = Buffer.from(js);
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/src="\/app\.js(?:\?[^"]*)?"/g, 'src="/app.js?v=20261024-follow-confirm"'));
  }


  if (relativePath.endsWith('.html')) {
    let html=bytes.toString('utf8');
    if (/^(packs|routines|free|about)\//.test(relativePath)) {
      if (!html.includes('href="/video-background.css')) html=html.replace('</head>','<link rel="stylesheet" href="/video-background.css?v=20261024-persistent-background"></head>');
      if (!html.includes('src="/video-background.js')) html=html.replace('</body>','<script src="/video-background.js?v=20261024-persistent-background" defer></script></body>');
    }
    html=html.replace(/(video-background\.(?:js|css))\?[^"]*/g,'$1?v=20261024-persistent-background');
    bytes=Buffer.from(html);
  }


  if (relativePath === 'routines/index.html') {
    bytes=Buffer.from(bytes.toString('utf8').replace(
      /(<article class="bundle-card">[\s\S]*?<h2>)[\s\S]*?<\/h2>/,
      '$1<span data-i18n="FOUR ROUTINES.">4 routines</span><br><span class="bundle-price-heading">only $4</span></h2>'
    ));
  }
  if (relativePath === 'catalog.css') {
    bytes=Buffer.concat([bytes,Buffer.from(`
/* One continuous translucent catalogue surface without grid seams. */
body[data-page="routines"] .coming-grid.individual-grid{gap:0!important;background:transparent!important;border:0;box-shadow:none}
body[data-page="routines"] .coming-grid.individual-grid>.bundle-card,
body[data-page="routines"] .coming-grid.individual-grid>.standalone-routine{background:rgba(17,23,34,.65)!important;background-image:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;backdrop-filter:none!important}
body[data-page="routines"] .individual-grid>.bundle-card .bundle-price-heading{font-size:.65em;line-height:1.5;font-weight:500}
`)]);
  }


  if (relativePath.endsWith('.html')) {
    const labels={en:'🇺🇸 ENG',uk:'🇺🇦 УКР',de:'🇩🇪 DEU',es:'🇪🇸 ESP',th:'🇹🇭 THA',id:'🇮🇩 IDN',ar:'🇸🇦 ARA',hi:'🇮🇳 HIN',it:'🇮🇹 ITA','pt-BR':'🇧🇷 POR'};
    bytes=Buffer.from(bytes.toString('utf8').replace(/(<option\b[^>]*value="([^"]+)"[^>]*>)[^<]*(<\/option>)/g,(all,open,language,close)=>labels[language]?open+labels[language]+close:all));
  }
  if (relativePath==='catalog.css') bytes=Buffer.concat([bytes,Buffer.from('\nhtml body .site-header .language-switch select{font-size:12px!important;min-width:92px;letter-spacing:.01em}html body .site-header .language-switch option{font-size:12px}\n')]);


  if (relativePath === 'routines/index.html') {
    bytes=Buffer.from(bytes.toString('utf8').replace(
      /(<a class="routine-detail-link"[^>]*?)data-i18n="SHOW PREVIEW">Show preview<\/a>/g,
      '$1data-i18n="OPEN ROUTINE">OPEN ROUTINE</a>'
    ));
  }
  if (relativePath === 'catalog.css') bytes=Buffer.concat([bytes,Buffer.from(`
/* Match the Free catalogue: separate cards, video above the title and purchase below. */
body[data-page="routines"] .coming-grid.individual-grid{gap:14px!important;background:transparent!important;align-items:stretch}
body[data-page="routines"] .coming-grid.individual-grid>.bundle-card,
body[data-page="routines"] .coming-grid.individual-grid>.standalone-routine{background:rgba(17,23,34,.79)!important;border:1px solid #303543!important;border-radius:10px!important;padding:24px!important;box-shadow:none!important;gap:18px;min-width:0}
body[data-page="routines"] .individual-grid .individual-card-layout{display:flex!important;flex-direction:column!important;align-items:center;justify-content:flex-start;gap:18px;text-align:center}
body[data-page="routines"] .individual-grid .individual-performance-video{display:block;width:min(100%,190px)!important;height:auto!important;aspect-ratio:9/16;object-fit:contain;margin:0 auto;order:0}
body[data-page="routines"] .individual-grid .individual-card-layout>div{width:100%;order:1}
body[data-page="routines"] .individual-grid h2,
body[data-page="routines"] .individual-grid>.bundle-card h2{font-size:20px!important;line-height:1.4!important;margin:0 0 10px}
body[data-page="routines"] .individual-grid .routine-includes{font-size:13px;margin:0 auto}
body[data-page="routines"] .individual-grid .routine-offer,
body[data-page="routines"] .individual-grid .bundle-offer{margin-top:auto;justify-content:center!important}
@media(max-width:600px){
 body[data-page="routines"] .coming-grid.individual-grid{grid-template-columns:minmax(0,1fr)!important}
 body[data-page="routines"] .individual-grid h2,body[data-page="routines"] .individual-grid>.bundle-card h2{font-size:16px!important}
}
`)]);


  if (relativePath === 'routines/index.html') {
    bytes=Buffer.from(bytes.toString('utf8').replace(/<article class="available-routine[^"]*"[^>]*>[\s\S]*?<\/article>/g,card=>{
      if(card.includes('class="routine-detail-link"'))return card;
      const href=card.match(/data-detail-href="([^"]+)"/)?.[1];
      return href?card.replace('</h2>','</h2><a class="routine-detail-link" href="'+href+'" data-i18n="OPEN ROUTINE">OPEN ROUTINE</a>'):card;
    }));
  }

  await fs.writeFile(destination, bytes);
  console.log(`Downloaded ${relativePath}`);
}

(async()=>{let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<files.length){const file=files[next++];await download(file);}}));await require('./scripts/download-drive-preview').downloadDrivePreview(process.env,{save:async(name,bytes)=>{const destination=path.join(__dirname,'web','assets','videos',name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);console.log('Downloaded public preview asset: '+name);}});await require('./scripts/import-free-routines').importFreeRoutines(process.env);await require('./scripts/import-call-me-maybe').importCallMeMaybe(process.env);})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});


