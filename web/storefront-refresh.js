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
      '<div class="rp-plan-copy"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h2 id="rp-plan-title">One plan. Every routine.</h2><p>Preview the routines below. Standard gives you access to individual downloads.</p></div>' +
      '<div class="rp-plan-offer"><p class="rp-plan-name">STANDARD <span>COMING SOON</span></p><p class="rp-plan-price">$15 <small>/ month</small></p><p class="rp-plan-rate-note">Same price on renewal.</p><p>Built for DJs who want more than one routine.</p><ul class="rp-plan-features"><li>Individual routine library</li><li>Video previews for every routine</li><li>MP3 downloads with an active subscription</li></ul>' +
      (home ? '<a href="/routines/#standard-plan">Explore the plan →</a>' : '<span class="rp-plan-pending">Subscription checkout is not open yet.</span>') + '</div></section>';
  }
  const nav = document.querySelector('.site-header nav');
  if (nav) {
    const price = document.createElement('a');
    price.className = 'rp-price-link';
    price.href = '/#standard-plan';
    price.textContent = 'Price';
    const packs = nav.querySelector('a[href="/packs/"]');
    if (packs) packs.replaceWith(price);
    else nav.insertBefore(price, nav.querySelector('a[href="/routines/"]'));
    price.addEventListener('click', () => nav.closest('.site-header')?.classList.remove('menu-open'));
  }

  document.querySelectorAll('.site-header [data-cart],main a[href="/packs/get-the-pack/"]').forEach(node => node.hidden = true);
  document.querySelectorAll('main a[href="/packs/"]').forEach(node => {
    if (node.matches('.route-card')) node.remove();
    else node.href = '/routines/';
  });
  document.querySelectorAll('a[href^="/packs/routine-"]').forEach(node => {
    const slug = /^\/packs\/(routine-0[1-6])\/?$/.exec(node.getAttribute('href'))?.[1];
    if (slug) node.href = '/routines/#' + slug;
  });

  const hero = document.querySelector('.rp-home .rp-hero');
  if (hero) {
    const actions = hero.querySelector('.rp-actions');
    if (actions) actions.innerHTML = '<a class="rp-get-started" href="#lessons">Get Started</a>';
    const brands = [
      ['rekordbox', 'rekordbox.svg'], ['Serato', 'serato.svg'],
      ['VirtualDJ', 'virtualdj-white.svg'], ['TRAKTOR', 'traktor.svg'],
      ['djay by Algoriddim', 'djay.png']
    ];
    const logos = () => brands.map(([name, file]) => '<img src="/assets/software/' + file + '" alt="' + name + '" loading="eager" decoding="async">').join('');
    hero.insertAdjacentHTML('afterend', '<section class="rp-software" aria-label="DJ software: rekordbox, Serato, VirtualDJ, Traktor and djay by Algoriddim"><div class="rp-ticker"><div class="rp-logo-group">' + logos() + '</div><div class="rp-logo-group" aria-hidden="true">' + logos() + '</div></div></section>');
    document.querySelector('main.rp-home')?.insertAdjacentHTML('beforeend', '<section class="rp-author"><img src="/assets/free-videos/get-right-x-just-a-lil-bit.jpg" alt="Mukvik performing at his DJ decks" loading="lazy"><div><p>BEHIND THE ROUTINES</p><h2>Meet Mukvik.</h2><p>I’m Mukvik, an open-format DJ and producer from Kyiv. I build routines around wordplay, tone play and transitions across hip-hop, R&amp;B, pop and club music.</p><a href="/about/">More about Mukvik →</a></div></section>' + plan(true));
  }

  const packRoutines = [
    ['Who’s That Girl × Drop It Like It’s Hot','routine-01'],
    ['PYHU × Shik Shak Shok','routine-02'],
    ['Temperature × M.A.A.D City','routine-03'],
    ['Shut Up × Shut Up and Let Me Go','routine-04'],
    ['Axel F × Promiscuous','routine-05'],
    ['Empire State of Mind','routine-06']
  ];
  function addPackRoutines(grid) {
    const fragment = document.createDocumentFragment();
    for (const [i,[title,slug]] of packRoutines.entries()) {
      const number = i + 1;
      const card = document.createElement('article');
      card.id = slug;
      card.className = 'standalone-routine available-routine';
      card.dataset.standardPackCard = slug;
      card.innerHTML = '<div class="individual-card-layout"><video class="individual-performance-video" controls playsinline preload="none" poster="/assets/lesson-previews/pack-' + number + '-blurred.jpg" src="/assets/lesson-previews/pack-' + number + '-blurred.mp4"></video><div><h2></h2><div class="rp-standard-actions"><button type="button" class="store-button">Listen</button></div></div></div>';
      const video = card.querySelector('video'), listen = card.querySelector('button');
      card.querySelector('h2').textContent = title;
      video.setAttribute('aria-label','Preview: ' + title);
      listen.addEventListener('click', () => video.paused ? video.play().catch(() => {}) : video.pause());
      video.addEventListener('play', () => { listen.textContent = 'Pause'; });
      for (const event of ['pause','ended']) video.addEventListener(event, () => { listen.textContent = 'Listen'; });
      fragment.append(card);
    }
    grid.prepend(fragment);
  }
  if (document.body.dataset.page === 'routines' || location.pathname.startsWith('/routines/')) {
    document.querySelectorAll('.bundle-card,.cross-sell,.routine-offer,.bundle-offer,.routine-detail-actions').forEach(node => node.remove());
    document.querySelectorAll('[data-buy]').forEach(node => node.remove());
    const grid = document.querySelector('.coming-grid.individual-grid');
    if (grid) {
      addPackRoutines(grid);
      grid.insertAdjacentHTML('beforebegin', '<div class="rp-routine-intro"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h1>Individual routines.</h1><p>Listen to the previews and explore the full routine library.</p></div>' + plan(false));
      document.querySelectorAll('.store-heading').forEach(node => node.remove());
    } else {
      document.querySelector('main')?.insertAdjacentHTML('beforeend', plan(false));
    }
  }

  // The plan is inserted by this script, so restore a direct link even when
  // the browser looked for the fragment before the section existed.
  const hash = location.hash;
  if (/^#(?:standard-plan|routine-0[1-6])$/.test(hash)) {
    requestAnimationFrame(() => {
      if (location.hash === hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    });
  }
})();
