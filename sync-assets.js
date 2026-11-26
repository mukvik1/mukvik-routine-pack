const fs = require('fs/promises');
const path = require('path');
const exec = require('node:util').promisify(require('node:child_process').execFile);
const { importHomePerformance, name: homePerformance } = require('./scripts/import-home-performance');

const origin = 'https://mukvik-routine-pack.mukvik.chatgpt.site';
const token = process.env.SITES_BYPASS_TOKEN;
const files = require('./config/site-assets.json').filter(file => !['i18n.js','store-account.js','video-background.js','video-background.css'].includes(file));
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
  if(relativePath==='merchant-config.json'){
    const config=JSON.parse(bytes);
    delete config.supportPhone;
    bytes=Buffer.from(JSON.stringify(config));
  }
  if(relativePath==='legal/seller/index.html'){
    bytes=Buffer.from(bytes.toString('utf8').replace(
      /<dt\b[^>]*>[^<]*<\/dt>\s*<dd\b[^>]*\bdata-merchant="supportPhone"[^>]*>[\s\S]*?<\/dd>/g,''));
  }

  if(relativePath==='messages.json'){
    const messages=JSON.parse(bytes);
    Object.assign(messages.uk,require('./config/storefront-uk.json'),{
      'More performances':'Більше виступів',
      'DJ routines with video lessons and downloadable MP3s.':'DJ-рутини з відеоуроками та MP3 для завантаження.',
      'Open free routine':'Відкрити безкоштовну рутину',
      'Search tracks':'Пошук треків',
      'Filter by plan':'Фільтр за тарифом',
      'All':'Усі',
      'No routines found.':'Рутини не знайдено.',
      'Downloads without an account':'Завантаження без акаунта',
      'Watch previews and download Free routines without an account.':'Дивіться прев’ю та завантажуйте Free-рутини без акаунта.',
      'Routine Pack is Mukvik’s library of DJ routines for practicing wordplay, tone play and transitions.':'Routine Pack — бібліотека DJ-рутин Mukvik для практики вордплею, тонплею та переходів.',
      'Unlock Pro routines with audio downloads and full videos where available.':'Відкрийте Pro-рутини з аудіофайлами та повними відео, де вони доступні.',
      'Get the full library, including Ultra exclusives.':'Отримайте всю бібліотеку разом з ексклюзивами Ultra.',
      'Could not check plan availability.':'Не вдалося перевірити доступність тарифів.',
      'Subscription checkout is temporarily unavailable.':'Оформлення підписки тимчасово недоступне.',
      'Try again':'Спробувати ще раз'
    });
    const rows=(await fs.readFile(path.join(__dirname,'config/storefront-asia.txt'),'utf8')).trim().split(/\r?\n/);
    for(const row of rows){
      const [key,...translations]=row.split('|');
      if(translations.length!==3||translations.some(value=>!value))throw Error('Invalid storefront translation: '+key);
      for(const [i,locale] of ['ko','vi','zh-CN'].entries())(messages[locale]??={})[key]=translations[i];
    }
    const european=require('./config/storefront-extra-languages.json');
    for(const [key,values] of Object.entries(european)){
      for(const [i,locale] of ['ja','nl','pl'].entries())(messages[locale]??={})[key]=values[i];
    }
    bytes=Buffer.from(JSON.stringify(messages));
  }
  if(relativePath.endsWith('.html')){
    bytes=Buffer.from(bytes.toString('utf8').replace(/src="\/i18n\.js(?:\?[^"]*)?"/g,'src="/i18n.js?v=18"'));
  }
  if (relativePath === 'index.html') {
    const html = bytes.toString('utf8');
    const hero = /(<div class="rp-hero-copy"[^>]*>)[\s\S]*?(<div class="rp-actions">)/;
    if (!hero.test(html)) throw new Error('Homepage hero structure changed');
    bytes = Buffer.from(html.replace(hero, '$1<h1><span data-i18n="Watch.">WATCH.</span><br><span data-i18n="Practice.">PRACTICE.</span><br><span data-i18n="Perform.">PERFORM.</span></h1>$2'));
  }
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
      'href="/$1.css?v=20261116-desktop-grid"'
    ));
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/src="\/store-account\.js(?:\?[^"]*)?"/g,'src="/store-account.js?v=ultra-upgrade-20261126"'));
  }
  if(relativePath.endsWith('.html')){
    bytes=Buffer.from(bytes.toString('utf8').replace(/src="\/video-background\.js(?:\?[^"]*)?"/g,'src="/video-background.js?v=20261024-routine-cards"'));
  }
  if (relativePath.startsWith('routines/') && relativePath.endsWith('.html')) {
    let html = bytes.toString('utf8');
    html = html.replace(/<(?:article|section) class="bundle-card">[\s\S]*?<\/(?:article|section)>/g, '');
    html = html.replace(/<section class="cross-sell">[\s\S]*?<\/section>/g, '');
    html = html.replace(/<div class="(?:routine-offer|bundle-offer|routine-detail-actions)">[\s\S]*?<\/div>/g, '');
    html = html.replace(/<div class="store-heading">[\s\S]*?<\/div>/g, '');
    bytes = Buffer.from(html);
  }
  if(relativePath.endsWith('.html')) {
    bytes=Buffer.from(bytes.toString('utf8').replaceAll('assets/mukvik-logo.png', 'assets/mukvik-logo-transparent.png'));
  }

  // Keep the storefront concise and the mobile hero close to the navigation.
  if (relativePath === 'index.html') {
    let html = bytes.toString('utf8');
    html = html.replace(/(<div class="rp-hero-copy"[^>]*>\s*)<p class="rp-kicker"[^>]*>\s*MUKVIK ROUTINE PACK\s*<\/p>/i,'$1');
    html = html.replace(/<section class="rp-section">(?:(?!<section)[\s\S])*?One pack\. Six big moments\.(?:(?!<\/section>)[\s\S])*?<\/section>/, '');
    html = html.replace(/<section class="rp-section rp-showcase" id="lessons">[\s\S]*?(?=<section class="rp-promo-wrap">)/, '');
    html = html.replace(/<section class="video-section home-video-section rp-promo">/, '<section class="video-section home-video-section rp-promo" id="watch-routines" style="scroll-margin-top:96px">');
    html = html.replace(/<button\b(?=[^>]*\bdata-video="6")[^>]*>[\s\S]*?<\/button>/, button => button
      .replace('data-video="6"', `data-video="6" data-video-src="/assets/videos/${homePerformance}.mp4"`)
      .replaceAll('/assets/videos/poster-6.jpg', `/assets/videos/${homePerformance}.jpg`));
    html = html.replace(/<div class="rp-actions">[\s\S]*?<\/div>/, '<div class="rp-actions"><a class="rp-get-started" href="/routines/">Get Started</a></div>');
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
    // Consent is shared with the navigation shell even when embedded storage is blocked.
    js = js.replace('let consentState = safeRead(CONSENT_KEY);', `const validConsent = value => value === 'accepted' || value === 'declined';
const consentHost = (() => { try { return window.top.location.origin === location.origin ? window.top : window; } catch { return window; } })();
const cookieConsent = () => { try { return document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(CONSENT_KEY+'='))?.split('=')[1]; } catch { return null; } };
let consentState = [consentHost.RPConsentChoice, safeRead(CONSENT_KEY), cookieConsent()].find(validConsent);
if (consentState) consentHost.RPConsentChoice = consentState;`);
    js = js.replace('  safeWrite(CONSENT_KEY, consentState);', `  safeWrite(CONSENT_KEY, consentState);
  try { document.cookie = CONSENT_KEY+'='+consentState+'; Path=/; Max-Age=31536000; SameSite=Lax; Secure'; } catch {}
  consentHost.RPConsentChoice = consentState;
  window.dispatchEvent(new Event('rp-consent-change'));
  if (consentHost !== window) consentHost.dispatchEvent(new Event('rp-consent-change'));`);
    js = js.replace("document.querySelectorAll('[data-cookie-settings]')", `window.addEventListener('rp-consent-change', () => {
  const next = consentHost.RPConsentChoice;
  if (!validConsent(next)) return;
  consentState = next;
  if (consentPanel) consentPanel.hidden = true;
  if (pixelStarted && typeof window.fbq === 'function') window.fbq('consent', next === 'accepted' ? 'grant' : 'revoke');
  if (next === 'accepted') loadMetaPixel();
});
document.querySelectorAll('[data-cookie-settings]')`);
    // Ask on every routine page, including returning visitors.
    js = js.replace("if (followWall && safeRead(FOLLOW_KEY) === 'confirmed') revealFree();\nelse if (followWall && safeSessionRead(FOLLOW_OPEN_KEY) === 'opened') enableConfirmFollow();",
      "if (followWall) enableConfirmFollow();");
    // Open Instagram only when the visitor explicitly chooses the follow link.
    js = js.replace('    beginFreeFollow();\n    window.location.href = link.href;', '    window.location.href = link.href;');
    js += "\n(() => { const q=document.querySelector('[data-follow-question]');if(!q)return;const update=()=>{q.textContent=document.documentElement.lang==='uk'?'Перед завантаженням підпишіться на @mukvik.ofc в Instagram. Ви вже підписані?':'Follow @mukvik.ofc on Instagram before downloading. Are you already following?';};update();new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});})();\n";
    bytes = Buffer.from(js);
  }
  if (relativePath.endsWith('.html')) {
    bytes = Buffer.from(bytes.toString('utf8').replace(/src="\/app\.js(?:\?[^"]*)?"/g, 'src="/app.js?v=consent-20261112"'));
  }


  if (relativePath.endsWith('.html')) {
    let html=bytes.toString('utf8');
    html=html.replace(/(<video\b[^>]*\bpreload=")metadata(")/g,'$1none$2');
    if (/^(packs|routines|free|about|legal)\//.test(relativePath)) {
      if (!html.includes('href="/video-background.css')) html=html.replace('</head>','<link rel="stylesheet" href="/video-background.css?v=20261024-persistent-background"></head>');
      if (!html.includes('src="/video-background.js')) html=html.replace('</body>','<script src="/video-background.js?v=20261118-legal-nav" defer></script></body>');
    }
    html=html.replace(/(video-background\.(?:js|css))\?[^"]*/g,'$1?v=20261118-legal-nav');
    if(relativePath==='packs/index.html')html=html.replace('<strong>$49</strong>','<del data-pack-list-price hidden>$49</del><strong data-pack-current-price>$49</strong>');
    html=html.replace('</head>','<link rel="stylesheet" href="/storefront-refresh.css?v=53"><script defer src="/storefront-refresh.js?v=52"></script></head>');
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
@media(min-width:1024px){
 body[data-page="routines"] .coming-grid.individual-grid{
  display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;
  gap:clamp(18px,2vw,32px)!important;width:min(1440px,100%)!important;
  max-width:1440px!important;margin-inline:auto!important;
 }
 body[data-page="routines"] .coming-grid.individual-grid>.standalone-routine{
  display:flex!important;flex-direction:column;align-items:stretch;justify-content:flex-start;
  gap:0;padding:0!important;overflow:hidden;border-radius:14px!important;
  border-color:#394767!important;background:#101520!important;
 }
 body[data-page="routines"] .individual-grid .individual-card-layout{
  flex:1;align-items:stretch;text-align:left;gap:0;min-width:0;
 }
 body[data-page="routines"] .individual-grid .individual-performance-video{
  width:100%!important;height:auto!important;aspect-ratio:16/9;
  object-fit:contain;background:#090d16;margin:0;
 }
 body[data-page="routines"] .individual-grid .individual-card-layout>div{
  flex:1;display:flex;flex-direction:column;box-sizing:border-box;padding:18px 20px 20px;
 }
 body[data-page="routines"] .individual-grid .individual-card-layout h2{margin:0 0 16px}
 body[data-page="routines"] .individual-grid .routine-detail-link{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  min-height:46px;margin-top:auto;padding:10px 14px;border:1px solid #365fae;
  border-radius:8px;background:#173e85;color:white;text-decoration:none;
 }
 body[data-page="routines"] .individual-grid .routine-detail-link::after{content:'→';font-size:1.15em}
 body[data-page="routines"] .individual-grid .routine-detail-link:is(:hover,:focus-visible){background:#2457ae;color:white}
}
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

async function refreshPromotionalPosters() {
  const directory = path.join(__dirname, 'web', 'assets', 'free-videos');
  const frames = [
    ['work-it-x-candy-shop', '3'],
    ['get-right-x-just-a-lil-bit', '1'],
    ['rihanna-routine', '3']
  ];
  for (const [slug, seconds] of frames) {
    await exec('ffmpeg', ['-v', 'error', '-y', '-ss', seconds, '-i', path.join(directory, slug + '.mp4'),
      '-frames:v', '1', '-q:v', '2', '-update', '1', path.join(directory, slug + '.jpg')], { timeout: 30000 });
  }
}

async function updatePricePage() {
  const homepage=await fs.readFile(path.join(__dirname,'web','index.html'),'utf8');
  const filename=path.join(__dirname,'web','price','index.html');
  let html=await fs.readFile(filename,'utf8');
  html=html.replace(/storefront-refresh\.css\?v=\d+/, 'storefront-refresh.css?v=53')
    .replace(/storefront-refresh\.js\?v=\d+/, 'storefront-refresh.js?v=52')
    .replace(/(video-background\.(?:js|css))\?[^"]+/g,'$1?v=20261118-legal-nav')
    .replace(/i18n\.js\?v=\d+/, 'i18n.js?v=18')
    .replace(/store-account\.js\?v=[^"]+/, 'store-account.js?v=ultra-upgrade-20261126');
  const consent=['cookie-consent','privacy'].map(id=>homepage.match(new RegExp('<(aside|dialog)\\b[^>]*id="'+id+'"[^>]*>[\\s\\S]*?</(?:aside|dialog)>'))?.[0]||'').join('');
  if(!html.includes('id="cookie-consent"'))html=html.replace('<script defer src="/i18n.js',consent+'<script defer src="/i18n.js');
  await fs.writeFile(filename,html);
}

(async()=>{let next=0;await Promise.all([importHomePerformance(path.join(__dirname,"web","assets","videos")), ...Array.from({length:6},async()=>{while(next<files.length){const file=files[next++];await download(file);}})]);await refreshPromotionalPosters();await updatePricePage();await require('./scripts/download-drive-preview').downloadDrivePreview(process.env,{save:async(name,bytes)=>{const destination=path.join(__dirname,'web','assets','videos',name);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);console.log('Downloaded public preview asset: '+name);}});await require('./scripts/import-free-routines').importFreeRoutines(process.env);await require('./scripts/import-call-me-maybe').importCallMeMaybe(process.env);await require('./scripts/import-free-pack-previews').importFreePackPreviews(process.env);await require('./scripts/sanitize-routine-archives').sanitizeRoutineArchives();await require('./scripts/import-routine-media').importRoutineMedia(process.env);await require('./scripts/remove-legacy-storefront').cleanStorefrontPages(path.join(__dirname,'web'));})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});


