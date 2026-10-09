const t = key => window.RP_I18N.t(key);
const uiText = (id, key) => { const el=document.getElementById(id); if(el){el.dataset.i18n=key;el.textContent=t(key);} };
const META_PIXEL_ID = '1041962862232567';
const CONSENT_KEY = 'mukvik_meta_consent_v1';
const FOLLOW_KEY = 'mukvik_instagram_follow_confirmed_v1';

const safeRead = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

const header = document.querySelector('.site-header');
document.querySelector('[data-menu]')?.addEventListener('click', () => header?.classList.toggle('menu-open'));

const CHECKOUT_API = 'https://mukvik-routine-pack-production.up.railway.app';
const paymentResult = document.getElementById('payment-result');
const orderToken = new URLSearchParams(window.location.search).get('order');
let paymentId = new URLSearchParams(window.location.search).get('paymentId');
const checkAgain = document.getElementById('check-again');
let checkTimer;

async function checkPayment() {
  clearTimeout(checkTimer);
  if (checkAgain) checkAgain.disabled = true;
  try {
    const response = await fetch(`${CHECKOUT_API}/api/payment-status?order=${encodeURIComponent(orderToken)}&paymentId=${encodeURIComponent(paymentId || '')}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(t(data.error) || t('We could not check the payment yet.'));
    const productName = document.getElementById('payment-product-name');
    if (data.productName && productName) productName.textContent = data.productName;
    if (data.status === 'finished' && data.deliveryUrl) {
      uiText('payment-title', 'PAYMENT COMPLETE');
      uiText('payment-message', 'Your download is ready. Save this page so you can return to it.');
      const link = document.getElementById('delivery-link');
      link.href = data.deliveryUrl;
      link.hidden = false;
      if (checkAgain) checkAgain.hidden = true;
      document.getElementById('payment-recovery').hidden = true;
      return;
    }
    uiText('payment-title', data.status === 'failed' ? 'PAYMENT NOT COMPLETED' : 'WAITING FOR PAYMENT');
    uiText('payment-message', data.message || 'Your payment is being confirmed.');
    if (data.status !== 'failed') checkTimer = setTimeout(checkPayment, 12000);
  } catch (error) {
    uiText('payment-message', error.message);
  } finally {
    if (checkAgain) checkAgain.disabled = false;
  }
}

if(!new URLSearchParams(location.search).has('monoOrder')) checkAgain?.addEventListener('click', checkPayment);
document.getElementById('payment-id-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  paymentId = document.getElementById('payment-id-input').value.trim();
  const url = new URL(window.location.href);
  url.searchParams.set('paymentId', paymentId);
  window.history.replaceState(null, '', url);
  checkPayment();
});
if (orderToken && paymentResult) {
  paymentResult.showModal();
  checkPayment();
}

const privacy = document.getElementById('privacy');
document.querySelectorAll('[data-privacy]').forEach((button) => button.addEventListener('click', () => privacy?.showModal()));
document.querySelectorAll('dialog [data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

let consentState = safeRead(CONSENT_KEY);
let pixelStarted = false;
const consentPanel = document.getElementById('cookie-consent');

function loadMetaPixel() {
  if (pixelStarted || consentState !== 'accepted') return;
  pixelStarted = true;
  const fbq = function () { if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments); else fbq.queue.push(arguments); };
  window.fbq = window.fbq || fbq; window._fbq = window._fbq || window.fbq;
  window.fbq.push = window.fbq; window.fbq.loaded = true; window.fbq.version = '2.0'; window.fbq.queue = [];
  const script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(script);
  window.fbq('init', META_PIXEL_ID); window.fbq('track', 'PageView');
}

if (consentState === 'accepted') loadMetaPixel();
else if (consentState !== 'declined' && consentPanel) consentPanel.hidden = false;

document.querySelectorAll('[data-consent]').forEach((button) => button.addEventListener('click', () => {
  consentState = button.dataset.consent === 'accept' ? 'accepted' : 'declined';
  safeWrite(CONSENT_KEY, consentState);
  if (consentPanel) consentPanel.hidden = true;
  if (consentState === 'accepted') loadMetaPixel();
}));
document.querySelectorAll('[data-cookie-settings]').forEach((button) => button.addEventListener('click', () => { if (consentPanel) consentPanel.hidden = false; }));

const player = document.getElementById('routine-player');
const videoChoices = [...document.querySelectorAll('[data-video]')];
function loadVideo(number, autoplay = false) {
  if (!player) return;
  player.poster = `/assets/videos/poster-${number}.jpg`;
  player.src = `/assets/videos/video-${number}.mp4`;
  player.load();
  if (autoplay) player.play().catch(() => {});
}
if (player) {
  loadVideo('1');
  videoChoices.forEach((choice, index) => choice.addEventListener('click', () => {
    loadVideo(choice.dataset.video, true);
    videoChoices.forEach((item) => { const active = item === choice; item.classList.toggle('selected', active); item.setAttribute('aria-pressed', String(active)); });
    const counter = document.getElementById('video-count'); if (counter) counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(videoChoices.length).padStart(2, '0')}`;
  }));
}

const followWall = document.getElementById('follow-wall');
const freeCatalog = document.getElementById('free-catalog');
const followLink = document.getElementById('instagram-follow');
const confirmFollow = document.getElementById('confirm-follow');

function revealFree() {
  if (followWall) followWall.hidden = true;
  if (freeCatalog) freeCatalog.hidden = false;
  const selected = new URLSearchParams(location.search).get('routine');
  if (selected) {
    const card = document.querySelector(`[data-routine-card="${CSS.escape(selected)}"]`);
    if (card) { card.classList.add('highlight'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); }
  }
}

if (followWall && safeRead(FOLLOW_KEY) === 'confirmed') revealFree();
followLink?.addEventListener('click', () => {
  if (confirmFollow) { confirmFollow.disabled = false; confirmFollow.dataset.i18n='I FOLLOWED — UNLOCK';confirmFollow.textContent=t(confirmFollow.dataset.i18n); }
});
confirmFollow?.addEventListener('click', () => { safeWrite(FOLLOW_KEY, 'confirmed'); revealFree(); });

document.querySelectorAll('[data-direct-download]').forEach((link) => link.addEventListener('click', () => {
  if (consentState === 'accepted' && typeof window.fbq === 'function') window.fbq('trackCustom', 'FreeRoutineDownload', { routine: link.dataset.routine });
}));

// Historical payment returns remain supported; new purchases open the account.
(async()=>{
 await window.RP_I18N.ready;
 const id=new URLSearchParams(location.search).get('monoOrder');if(!id||!paymentResult)return;
 const fragment=new URLSearchParams(location.hash.slice(1));
 let capability=fragment.get('monoCapability');
 try{if(capability)sessionStorage.setItem(`mono:${id}`,capability);else capability=sessionStorage.getItem(`mono:${id}`);}catch{}
 if(fragment.has('monoCapability'))history.replaceState(null,'',location.pathname+location.search);
 document.getElementById('payment-recovery').hidden=true;
 const link=document.getElementById('delivery-link');link.hidden=true;
 const download=document.createElement('button');download.className='cta';download.type='button';download.dataset.i18n='DOWNLOAD ONCE';download.textContent=t('DOWNLOAD ONCE');download.hidden=true;link.after(download);
 paymentResult.showModal();
 let timer;
 async function status(){clearTimeout(timer);try{
  const response=await fetch(`${CHECKOUT_API}/api/monobank/status?orderId=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${capability||''}`},cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.code||'unavailable');
  const failed=['failure','reversed','expired'].includes(data.status);
  uiText('payment-title',data.status==='success'?'PAYMENT COMPLETE':failed?'PAYMENT NOT COMPLETED':'WAITING FOR PAYMENT');
  uiText('payment-message',data.canDownload?'Your download is ready. Save this page so you can return to it.':data.status==='success'?'Download already used or unavailable. Contact the seller with your order ID.':failed?'PAYMENT NOT COMPLETED':'Your payment is being confirmed.');
  download.hidden=!data.canDownload;
  if(!failed&&data.status!=='success')timer=setTimeout(status,15000);
 }catch(e){uiText('payment-message',e.message);}}
 // Native POST streams large ZIPs directly into the browser's download manager.
 download.addEventListener('click',()=>{
  const form=document.createElement('form');form.method='POST';form.action=`${CHECKOUT_API}/api/monobank/download`;
  for(const [name,value] of Object.entries({orderId:id,capability})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
  document.body.append(form);form.submit();form.remove();download.disabled=true;uiText('payment-message','Download started. Save the ZIP file.');
 });
 checkAgain?.addEventListener('click',status);
 status();
})();

// Keep demos from playing over each other when switching between routines.
document.querySelectorAll('video').forEach(video => {
  video.addEventListener('play', () => {
    document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); });
  });
});
