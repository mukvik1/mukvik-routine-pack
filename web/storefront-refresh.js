(() => {
  'use strict';
  if (window.parent === window) {
    const snow = document.createElement('div');
    snow.className = 'rp-snow';
    snow.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 54; i++) {
      const flake = document.createElement('i');
      flake.style.cssText = '--x:' + Math.random() * 100 + '%;--size:' + (2 + Math.random() * 3.5) + 'px;--time:' + (11 + Math.random() * 16) + 's;--delay:-' + Math.random() * 27 + 's;--drift:' + (Math.random() * 80 - 40) + 'px';
      snow.append(flake);
    }
    document.body.append(snow);
    document.addEventListener('visibilitychange', () => snow.hidden = document.hidden);
  }

  function plan(home) {
    return '<section class="rp-plan' + (home ? ' rp-plan-home' : '') + '" id="standard-plan" aria-labelledby="rp-plan-title">' +
      '<div class="rp-plan-copy"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h2 id="rp-plan-title">One plan. Every routine.</h2><p>Explore the individual routines now. Standard membership is being prepared for launch.</p></div>' +
      '<div class="rp-plan-offer"><p class="rp-plan-name">STANDARD <span>COMING SOON</span></p><p class="rp-plan-price">$15 <small>/ month</small></p><p>Planned access to the individual routine library and audio downloads while your membership is active.</p>' +
      (home ? '<a href="/routines/#standard-plan">Explore the plan →</a>' : '<span class="rp-plan-pending">Subscription checkout is not open yet.</span>') + '</div></section>';
  }
  const hero = document.querySelector('.rp-home .rp-hero');
  if (hero) {
    const actions = hero.querySelector('.rp-actions');
    if (actions) actions.innerHTML = '<a class="rp-get-started" href="#lessons">Get Started →</a>';
    const brands = [
      ['rekordbox', 'rekordbox.svg'], ['Serato', 'serato.svg'],
      ['VirtualDJ', 'virtualdj.svg'], ['TRAKTOR', 'traktor.png'],
      ['djay by Algoriddim', 'djay.png']
    ];
    const logos = () => brands.map(([name, file]) => '<img src="/assets/software/' + file + '" alt="' + name + '" loading="eager" decoding="async">').join('');
    hero.insertAdjacentHTML('afterend', '<section class="rp-software" aria-label="DJ software: rekordbox, Serato, VirtualDJ, Traktor and djay by Algoriddim"><div class="rp-ticker"><div class="rp-logo-group">' + logos() + '</div><div class="rp-logo-group" aria-hidden="true">' + logos() + '</div></div></section>');
    document.querySelector('.rp-home main')?.insertAdjacentHTML('beforeend', '<section class="rp-author"><img src="/assets/free-videos/get-right-x-just-a-lil-bit.jpg" alt="Mukvik performing at his DJ decks" loading="lazy"><div><p>BEHIND THE ROUTINES</p><h2>Meet Mukvik.</h2><p>I’m Mukvik, an open-format DJ and producer from Kyiv. I build routines around wordplay, tone play and transitions across hip-hop, R&amp;B, pop and club music.</p><a href="/about/">More about Mukvik →</a></div></section>' + plan(true));
  }

  if (document.body.dataset.page === 'routines' || location.pathname.startsWith('/routines/')) {
    document.querySelectorAll('.bundle-card,.cross-sell,.routine-offer,.bundle-offer,.routine-detail-actions').forEach(node => node.remove());
    document.querySelectorAll('[data-buy]').forEach(node => node.remove());
    const grid = document.querySelector('.coming-grid.individual-grid');
    if (grid) {
      grid.insertAdjacentHTML('beforebegin', '<div class="rp-routine-intro"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h1>Individual routines.</h1><p>Watch the previews. A single membership for the routine library is on its way.</p></div>' + plan(false));
      document.querySelectorAll('.store-heading').forEach(node => node.remove());
    } else {
      document.querySelector('main')?.insertAdjacentHTML('beforeend', plan(false));
    }
  }
})();
