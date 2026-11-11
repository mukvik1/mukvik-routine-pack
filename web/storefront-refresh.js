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
    const offer = (tier, name, price, description) =>
      '<div class="rp-plan-offer rp-offer-' + tier + '" data-plan-tier="' + tier + '"><p class="rp-plan-name">' + name + '</p><span class="rp-plan-edition">' + (tier==='pro'?'FULL LIBRARY':'ESSENTIALS') + '</span>' +
      '<p class="rp-plan-price">$' + price + ' <small>/ month</small></p><p class="rp-plan-rate-note">Same price on renewal.</p><p>' + description + '</p>' +
      '<ul class="rp-plan-features"><li>' + (tier === 'pro' ? 'All Standard routines plus 4 Pro routines' : '10 Standard routines') +
      '</li><li>Video previews</li><li>Downloads with an active subscription</li></ul>' +
      '<span class="rp-plan-pending">Checking availability…</span></div>';
    return '<section class="rp-plan rp-plan-tiers' + (home ? ' rp-plan-home' : '') + '" id="standard-plan" aria-labelledby="rp-plan-title">' +
      '<div class="rp-plan-copy"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h2 id="rp-plan-title">Choose your plan.</h2>' +
      '<p>Preview the routines and choose the downloads you want.</p></div>' +
      offer('standard','Standard',15,'The essentials for your next set.') +
      offer('pro','Pro',25,'The full library, including Pro exclusives.') + '</section>';
  }
  const nav = document.querySelector('.site-header nav');
  if (nav) {
    const price = document.createElement('a');
    price.className = 'rp-price-link';
    price.href = '/price/';
    if (/^\/price\/?$/.test(location.pathname)){price.classList.add('active');price.setAttribute('aria-current','page');}
    price.textContent = 'Price';
    nav.querySelectorAll('a[href="/packs/"]').forEach(node=>node.remove());
    const routines=nav.querySelector('a[href="/routines/"]');
    if(routines)routines.after(price);else nav.append(price);
    price.addEventListener('click', () => nav.closest('.site-header')?.classList.remove('menu-open'));
  }

  document.querySelectorAll('.site-header [data-cart],main a[href="/packs/get-the-pack/"]').forEach(node => node.hidden = true);
  document.querySelectorAll('main a[href="/packs/"]').forEach(node => {
    if (node.matches('.route-card')) node.remove();
    else node.href = '/routines/';
  });
  document.querySelectorAll('a[href^="/packs/routine-"]').forEach(node => {
    const slug = /^\/packs\/(routine-0[1-6])\/?$/.exec(node.getAttribute('href'))?.[1];
    if (slug) node.href = '/routines/' + slug + '/';
  });

  const hero = document.querySelector('.rp-home .rp-hero');
  if (hero) {
    const actions = hero.querySelector('.rp-actions');
    document.querySelector('#lessons')?.remove();
    const performances=document.querySelector('.rp-promo-wrap,.home-video-section');
    if(performances)performances.id='performances';
    if (actions) actions.innerHTML = '<a class="rp-get-started" href="'+(performances?'#performances':'/routines/')+'">Get Started</a>';
    const brands = [
      ['rekordbox', 'rekordbox.svg'], ['Serato', 'serato.svg'],
      ['VirtualDJ', 'virtualdj-white.svg'], ['TRAKTOR', 'traktor.svg'],
      ['djay by Algoriddim', 'djay-white.svg']
    ];
    const logos = () => brands.map(([name, file]) => '<img src="/assets/software/' + file + '" alt="' + name + '" loading="eager" decoding="async">').join('');
    hero.insertAdjacentHTML('afterend', '<section class="rp-software" aria-label="DJ software: rekordbox, Serato, VirtualDJ, Traktor and djay by Algoriddim"><div class="rp-ticker"><div class="rp-logo-group">' + logos() + '</div><div class="rp-logo-group" aria-hidden="true">' + logos() + '</div></div></section>');
    document.querySelector('main.rp-home')?.insertAdjacentHTML('beforeend', '<section class="rp-author"><img src="/assets/free-videos/get-right-x-just-a-lil-bit.jpg" alt="Mukvik performing at his DJ decks" loading="lazy"><div><p>BEHIND THE ROUTINES</p><h2>Meet Mukvik.</h2><p>I’m Mukvik, an open-format DJ and producer from Kyiv. I build routines around wordplay, tone play and transitions across hip-hop, R&amp;B, pop and club music.</p><a href="/about/">More about Mukvik →</a></div></section>');
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
      card.innerHTML = '<div class="individual-card-layout"><img class="individual-performance-video" loading="lazy" alt="" src="/assets/lesson-previews/pack-' + number + '-blurred.jpg"><div><h2></h2><a class="routine-detail-link" href="/routines/' + slug + '/">Open Routine</a></div></div>';
      card.querySelector('h2').textContent = title;
      fragment.append(card);
    }
    grid.prepend(fragment);
  }
  if (/^\/price\/?$/.test(location.pathname)) {
    document.querySelector('main')?.insertAdjacentHTML('beforeend',plan(false));
  }
  if (document.body.dataset.page === 'routines' || location.pathname.startsWith('/routines/')) {
    document.querySelectorAll('.bundle-card,.cross-sell,.routine-offer,.bundle-offer,.routine-detail-actions').forEach(node => node.remove());
    document.querySelectorAll('[data-buy]').forEach(node => node.remove());
    const grid = document.querySelector('.coming-grid.individual-grid');
    if (grid) {
      addPackRoutines(grid);
      grid.insertAdjacentHTML('beforebegin','<div class="rp-routine-intro"><h1>Individual Routines</h1></div>');
      for(const link of grid.querySelectorAll('a.routine-detail-link'))link.textContent='Open Routine';
      for(const video of grid.querySelectorAll('video[poster]')){
        const poster=document.createElement('img');poster.className=video.className;poster.src=video.poster;poster.alt='';poster.loading='lazy';video.replaceWith(poster);
      }
      document.querySelectorAll('.store-heading').forEach(node => node.remove());
    } else {
      const main=document.querySelector('main');
      const slug=/^\/routines\/(routine-0[1-6])\/?$/.exec(location.pathname)?.[1];
      const entry=packRoutines.findIndex(([,id])=>id===slug);
      if(main&&entry>=0){
        const number=entry+1;
        document.title=packRoutines[entry][0]+' — MUKVIK';
        main.innerHTML='<section class="routine-detail-panel"><p><a href="/routines/">Routines</a></p><h1></h1><video class="routine-detail-video" controls playsinline preload="none" poster="/assets/lesson-previews/pack-'+number+'-blurred.jpg" src="/assets/lesson-previews/pack-'+number+'-blurred.mp4"></video></section>';
        main.querySelector('h1').textContent=packRoutines[entry][0];
      }
      const section=main?.querySelector('.routine-detail-panel');
      if(section){
        const player=section.querySelector('video');
        const actions=document.createElement('div');actions.className='rp-detail-controls';actions.dataset.routineActions='';
        if(player){
          const play=document.createElement('button');play.type='button';play.className='store-button';play.textContent='Play';
          play.addEventListener('click',()=>player.paused?player.play().catch(()=>{}):player.pause());
          player.addEventListener('play',()=>play.textContent='Pause');
          for(const event of ['pause','ended'])player.addEventListener(event,()=>play.textContent='Play');
          actions.append(play);
        }
        section.append(actions);
      }
      main?.insertAdjacentHTML('beforeend',plan(false));
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
