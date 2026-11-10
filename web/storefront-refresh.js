(() => {
  'use strict';
  if (window.parent === window) {
    const snow = document.createElement('div');
    snow.className = 'rp-snow';
    snow.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 36; i++) {
      const flake = document.createElement('i');
      flake.style.cssText = '--x:'+Math.random()*100+'%;--size:'+(1+Math.random()*2)+'px;--time:'+(12+Math.random()*15)+'s;--delay:-'+Math.random()*27+'s';
      snow.append(flake);
    }
    document.body.append(snow);
    document.addEventListener('visibilitychange', () => snow.hidden = document.hidden);
  }
  const hero = document.querySelector('.rp-home .rp-hero');
  if (!hero) return;
  const actions = hero.querySelector('.rp-actions');
  if (actions) {
    const link = document.createElement('a');
    link.className = 'rp-get-started';
    link.href = '#rp-start';
    link.textContent = 'Get Started →';
    actions.prepend(link);
  }
  hero.insertAdjacentHTML('afterend', '<section class="rp-software" aria-label="DJ software: rekordbox, Serato, VirtualDJ"><span>DJ SOFTWARE</span><div class="rp-ticker" aria-hidden="true"><div><b>rekordbox　 ✦　 Serato　 ✦　 VirtualDJ　 ✦　 </b><b>rekordbox　 ✦　 Serato　 ✦　 VirtualDJ　 ✦　 </b></div></div><button type="button" class="rp-ticker-toggle" aria-label="Pause software ticker">Ⅱ</button></section><section class="rp-start" id="rp-start"><h2>Find your next routine.</h2><div class="rp-start-grid"><a href="/free/"><span aria-hidden="true">▷</span><strong>Try it free</strong><small>Watch and download free routines.</small></a><a href="/routines/"><span aria-hidden="true">♫</span><strong>Explore routines</strong><small>Find transitions for your next set.</small></a><a href="/packs/get-the-pack/"><span aria-hidden="true">▤</span><strong>Routine Pack Vol. 1</strong><small>Six routines with full video walkthroughs.</small></a></div></section>');
  const toggle = document.querySelector('.rp-ticker-toggle');
  toggle.addEventListener('click', () => {
    const paused = toggle.closest('.rp-software').classList.toggle('rp-ticker-paused');
    toggle.textContent = paused ? '▷' : 'Ⅱ';
    toggle.setAttribute('aria-label', paused ? 'Resume software ticker' : 'Pause software ticker');
  });
  document.querySelector('main')?.insertAdjacentHTML('beforeend', '<section class="rp-author"><img src="/assets/free-videos/get-right-x-just-a-lil-bit.jpg" alt="Mukvik performing at his DJ decks" loading="lazy"><div><p>BEHIND THE ROUTINES</p><h2>Meet Mukvik.</h2><p>I’m Mukvik, an open-format DJ and producer from Kyiv. I build routines around wordplay, tone play and transitions across hip-hop, R&amp;B, pop and club music.</p><a href="/about/">More about Mukvik →</a></div></section>');
})();
