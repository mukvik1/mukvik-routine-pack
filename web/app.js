const checkout = document.getElementById('checkout');

document.querySelectorAll('[data-buy]').forEach((btn) => {
  btn.addEventListener('click', () => checkout.showModal());
});
checkout.addEventListener('click', (event) => {
  if (event.target === checkout) checkout.close();
});
document.querySelectorAll('dialog .close').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

const checkoutButton = document.getElementById('checkout-button');
const checkoutError = document.getElementById('checkout-error');
checkoutButton.addEventListener('click', async () => {
  checkoutButton.disabled = true;
  checkoutButton.textContent = 'OPENING CHECKOUT…';
  checkoutError.hidden = true;
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json();
    if (!response.ok || !data.invoiceUrl) throw new Error(data.error || 'Could not open checkout. Please try again.');
    window.location.assign(data.invoiceUrl);
  } catch (error) {
    checkoutError.textContent = error.message;
    checkoutError.hidden = false;
    checkoutButton.disabled = false;
    checkoutButton.innerHTML = '<strong>PAY WITH USDT <span>→</span></strong><small>TRON NETWORK · BINANCE OR ANY CRYPTO WALLET</small>';
  }
});

const resultDialog = document.getElementById('payment-result');
const orderToken = new URLSearchParams(window.location.search).get('order');
let paymentId = new URLSearchParams(window.location.search).get('paymentId');
const checkAgain = document.getElementById('check-again');
let checkTimer;
async function checkPayment() {
  clearTimeout(checkTimer);
  checkAgain.disabled = true;
  try {
    const response = await fetch(`/api/payment-status?order=${encodeURIComponent(orderToken)}&paymentId=${encodeURIComponent(paymentId || '')}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We could not check the payment yet.');
    if (data.status === 'finished' && data.deliveryUrl) {
      document.getElementById('payment-title').textContent = 'PAYMENT COMPLETE';
      document.getElementById('payment-message').textContent = 'Your pack is ready. Save this page so you can return to it.';
      const link = document.getElementById('delivery-link');
      link.href = data.deliveryUrl;
      link.hidden = false;
      checkAgain.hidden = true;
      document.getElementById('payment-recovery').hidden = true;
      return;
    }
    document.getElementById('payment-title').textContent = data.status === 'failed' || data.status === 'expired' ? 'PAYMENT NOT COMPLETED' : 'WAITING FOR PAYMENT';
    document.getElementById('payment-message').textContent = data.message || 'Your payment is being confirmed. This page checks again automatically.';
    if (data.status !== 'failed' && data.status !== 'expired') checkTimer = setTimeout(checkPayment, 12000);
  } catch (error) {
    document.getElementById('payment-message').textContent = error.message;
  } finally {
    checkAgain.disabled = false;
  }
}
checkAgain.addEventListener('click', checkPayment);
document.getElementById('payment-id-form').addEventListener('submit', event => {
  event.preventDefault();
  paymentId = document.getElementById('payment-id-input').value.trim();
  const url = new URL(window.location.href);
  url.searchParams.set('paymentId', paymentId);
  window.history.replaceState(null, '', url);
  checkPayment();
});
if (orderToken) {
  resultDialog.showModal();
  checkPayment();
}

const player = document.getElementById('routine-player');
const choices = [...document.querySelectorAll('[data-video]')];
const loadRoutine = (videoNumber, autoplay = false) => {
  player.pause();
  player.poster = `./assets/videos/poster-${videoNumber}.jpg`;
  player.src = `./assets/videos/video-${videoNumber}.mp4`;
  player.load();
  if (autoplay) player.play().catch(() => {});
};

choices.forEach((button, index) => {
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    player.setAttribute('aria-label', `MUKVIK routine video ${index + 1} of ${choices.length}`);
    loadRoutine(button.dataset.video, true);
    document.getElementById('video-count').textContent = `${String(index + 1).padStart(2, '0')} / 05`;
    choices.forEach((choice) => {
      const active = choice === button;
      choice.classList.toggle('selected', active);
      choice.setAttribute('aria-pressed', String(active));
    });
  });
});

loadRoutine('1');
