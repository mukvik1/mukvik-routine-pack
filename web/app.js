const checkout = document.getElementById('checkout');

document.querySelectorAll('[data-buy]').forEach((btn) => {
  btn.addEventListener('click', () => checkout.showModal());
});

checkout.addEventListener('click', (event) => {
  if (event.target === checkout) checkout.close();
});

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
