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
      '<div class="rp-plan-offer rp-offer-' + tier + '" hidden data-plan-tier="' + tier + '"><p class="rp-plan-name">' + name + '</p><span class="rp-plan-edition">' + (tier==='pro'?'FULL LIBRARY':'ESSENTIALS') + '</span>' +
      '<p class="rp-plan-price">$' + price + ' <small>/ month</small></p><p class="rp-plan-rate-note">Same price on renewal.</p><p>' + description + '</p>' +
      '<ul class="rp-plan-features"><li>' + (tier === 'pro' ? 'All Pro routines plus 4 Ultra routines' : '8 Pro routines') +
      '</li><li>Video previews</li><li>Downloads with an active subscription</li></ul>' +
      '<span class="rp-plan-pending">Checking availability…</span></div>';
    const free = '<div class="rp-plan-offer rp-offer-free" hidden><p class="rp-plan-name">Free</p><span class="rp-plan-edition">FREE ROUTINES</span>' +
      '<p class="rp-plan-price">$0</p><p class="rp-plan-rate-note">Activated when you create an account.</p><p>Get started with the free routines.</p>' +
      '<ul class="rp-plan-features"><li>8 free routines</li><li>Video previews</li><li>Downloads with a free account</li></ul>' +
      '<a class="store-button" href="/routines/#free-routines">Browse free routines</a></div>';
    return '<section class="rp-plan rp-plan-tiers' + (home ? ' rp-plan-home' : '') + '" id="standard-plan" aria-labelledby="rp-plan-title">' +
      '<div class="rp-plan-copy"><p class="rp-plan-kicker">THE ROUTINE LIBRARY</p><h2 id="rp-plan-title">Choose your plan.</h2>' +
      '<p>Preview the routines and choose the downloads you want.</p></div>' +
      free + offer('standard','Pro',15,'The essentials for your next set.') +
      offer('pro','Ultra',25,'The full library, including Ultra exclusives.') + '</section>';
  }
  const nav = document.querySelector('.site-header nav');
  if (nav) {
    const price = document.createElement('a');
    price.className = 'rp-price-link';
    price.href = '/price/';
    if (/^\/price\/?$/.test(location.pathname)){price.classList.add('active');price.setAttribute('aria-current','page');}
    price.textContent = 'Price';
    nav.querySelectorAll('a[href="/packs/"],a[href="/free/"]').forEach(node=>node.remove());
    const routines=nav.querySelector('a[href="/routines/"]');
    if(routines)routines.after(price);else nav.append(price);
    price.addEventListener('click', () => nav.closest('.site-header')?.classList.remove('menu-open'));
  }

  document.querySelectorAll('.site-header [data-cart],main a[href="/packs/get-the-pack/"]').forEach(node => node.hidden = true);
  document.querySelectorAll('main a[href="/free/"]').forEach(node => node.href='/routines/#free-routines');
  document.querySelectorAll('main a[href="/packs/"]').forEach(node => {
    if (node.matches('.route-card')) node.remove();
    else node.href = '/routines/';
  });
  document.querySelectorAll('a[href^="/packs/routine-"]').forEach(node => {
    const slug = /^\/packs\/(routine-0[1-6])\/?$/.exec(node.getAttribute('href'))?.[1];
    if (slug) node.href = '/routines/' + ({'routine-01':'whos-that-girl-drop-it-like-its-hot','routine-02':'pyhu-shik-shak-shok','routine-03':'temperature-maad-city','routine-04':'shut-up-shut-up-and-let-me-go','routine-05':'axel-f-promiscuous','routine-06':'empire-state-of-mind'})[slug] + '/';
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
      ['djay by Algoriddim', 'djay-official.png']
    ];
    const logos = () => brands.map(([name, file]) => '<img src="/assets/software/' + file + '" alt="' + name + '" loading="eager" decoding="async">').join('');
    hero.querySelector('.rp-hero-copy')?.insertAdjacentHTML('afterend', '<section class="rp-software" aria-label="DJ software: rekordbox, Serato, VirtualDJ, Traktor and djay by Algoriddim"><div class="rp-ticker"><div class="rp-logo-group">' + logos() + '</div><div class="rp-logo-group" aria-hidden="true">' + logos() + '</div></div></section>');
    document.querySelector('main.rp-home')?.insertAdjacentHTML('beforeend', '<section class="rp-author"><img src="/assets/mukvik-live.jpg" width="1280" height="851" alt="Mukvik performing a DJ set in a club" loading="lazy" decoding="async"><div><p>BEHIND THE ROUTINES</p><h2>Meet Mukvik.</h2><p>I’m Mukvik, an open-format DJ and producer from Kyiv. I build routines around wordplay, tone play and transitions across hip-hop, R&amp;B, pop and club music.</p><a href="/about/">More about Mukvik →</a></div></section>');
  }

  const packRoutines = [
    ['Who’s That Girl × Drop It Like It’s Hot','routine-01','whos-that-girl-drop-it-like-its-hot'],
    ['PYHU × Shik Shak Shok','routine-02','pyhu-shik-shak-shok'],
    ['Temperature × M.A.A.D City','routine-03','temperature-maad-city'],
    ['Shut Up × Shut Up and Let Me Go','routine-04','shut-up-shut-up-and-let-me-go'],
    ['Axel F × Promiscuous','routine-05','axel-f-promiscuous'],
    ['Empire State of Mind','routine-06','empire-state-of-mind']
  ];
  const freePackSlugs = new Set(['routine-04','routine-06']);
  const otherRoutines = [
    ['Call Me Maybe × Poker Face','call-me-maybe-poker-face'],
    ['Tell Me Why × Trust Me','tell-me-why-trust-me'],
    ['Calm Down × Crazy in Love','calm-down-crazy-in-love'],
    ['Yeah × La Vida Es Un Carnaval','yeah-la-vida-es-un-carnaval'],
    ['Not Like Us × Candy Shop','not-like-us-candy-shop'],
    ['Macarena × Candy Shop','macarena-candy-shop'],
    ['Levitation to Can’t Stop × Rompe','levitation-cant-stop-rompe'],
    ['I Know You Want Me × Chandelier','i-know-you-want-me-chandelier']
  ];
  const freeRoutines = [
    ['Get Right × Just a Lil Bit','get-right-x-just-a-lil-bit'],
    ['Work It × Candy Shop','work-it-x-candy-shop'],
    ['Rihanna Routine','rihanna-routine'],
    ['Macarena × Gasolina','macarena-gasolina'],
    ['Slick × Love Me Again','slick-love-me-again'],
    ['One More Time','one-more-time']
  ];
  const paidPath = slug => '/routines/' + slug + '/';
  const freePath = slug => '/free/' + slug + '/';
  const pages = new Map([
    ...packRoutines.map(([title,,slug])=>[slug,[title,paidPath(slug)]]),
    ...otherRoutines.map(([title,slug])=>[slug,[title,paidPath(slug)]]),
    ...freeRoutines.map(([title,slug])=>[slug,[title,freePath(slug)]])
  ]);
  const mixedOrder = [
    'get-right-x-just-a-lil-bit','whos-that-girl-drop-it-like-its-hot',
    'temperature-maad-city','pyhu-shik-shak-shok',
    'work-it-x-candy-shop','tell-me-why-trust-me',
    'axel-f-promiscuous','shut-up-shut-up-and-let-me-go',
    'calm-down-crazy-in-love','rihanna-routine',
    'not-like-us-candy-shop','macarena-gasolina',
    'call-me-maybe-poker-face','empire-state-of-mind',
    'macarena-candy-shop','slick-love-me-again',
    'yeah-la-vida-es-un-carnaval','levitation-cant-stop-rompe',
    'one-more-time','i-know-you-want-me-chandelier'
  ];
  const routinePages = mixedOrder.map(slug=>pages.get(slug));
  function addFreeRoutines(grid) {
    for (const [index,[title,slug]] of freeRoutines.entries()) {
      const card=document.createElement('article');
      card.className='standalone-routine available-routine rp-tiered-routine';
      if(index===0)card.id='free-routines';
      card.innerHTML='<span class="rp-routine-tier rp-routine-tier-free">Free</span><div class="individual-card-layout"><img class="individual-performance-video" loading="lazy" decoding="async" alt=""><div><h2></h2><a class="routine-detail-link">Open Routine</a></div></div>';
      card.querySelector('img').src='/assets/free-videos/'+slug+'.jpg';
      card.querySelector('h2').textContent=title;
      card.querySelector('a').href=freePath(slug);
      grid.append(card);
    }
    const cards=new Map(Array.from(grid.children, card=>[card.querySelector('a.routine-detail-link')?.pathname.replace(/\/?$/,'/'),card]));
    const ordered=document.createDocumentFragment();
    for(const [,href] of routinePages){
      const card=cards.get(href);
      if(card)ordered.append(card);
    }
    grid.prepend(ordered);
  }
  function addRoutinePager(section) {
    const path=location.pathname.replace(/\/?$/,'/');
    const position=routinePages.findIndex(([,href])=>href===path);
    if(position<0)return;
    const pager=document.createElement('nav');pager.className='rp-routine-pager';pager.setAttribute('aria-label','Browse routines');
    for(const [offset,side] of [[-1,'previous'],[1,'next']]){
      const [title,href]=routinePages[(position+offset+routinePages.length)%routinePages.length];
      const link=document.createElement('a');link.className='rp-routine-pager-'+side;link.href=href;
      link.setAttribute('aria-label',(offset<0?'Previous routine: ':'Next routine: ')+title);
      const direction=document.createElement('span');direction.className='rp-pager-direction';direction.textContent=offset<0?'← Previous':'Next →';
      const label=document.createElement('strong');label.textContent=title;
      link.append(direction,label);pager.append(link);
    }
    section.after(pager);
  }
  const freeDetail=document.querySelector('main .free-intro');
  if(freeDetail && /^\/free\/[a-z0-9-]+\/?$/.test(location.pathname))addRoutinePager(freeDetail);

  function addPackRoutines(grid) {
    const fragment = document.createDocumentFragment();
    for (const [i,[title,slug,path]] of packRoutines.entries()) {
      const number = i + 1;
      const card = document.createElement('article');
      card.id = slug;
      card.className = 'standalone-routine available-routine';
      card.dataset.standardPackCard = slug;
      const isFree=freePackSlugs.has(slug);
      if(isFree)card.classList.add('rp-tiered-routine');
      const badge=isFree?'<span class="rp-routine-tier rp-routine-tier-free">Free</span>':'';
      const poster=isFree?'':'<img class="individual-performance-video" loading="lazy" alt="" src="/assets/lesson-previews/pack-'+number+'-blurred.jpg">';
      card.innerHTML = badge+'<div class="individual-card-layout">'+poster+'<div><h2></h2><a class="routine-detail-link" href="/routines/' + path + '/">Open Routine</a></div></div>';
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
      addFreeRoutines(grid);
      grid.insertAdjacentHTML('beforebegin','<div class="rp-routine-intro"><h1>Individual Routines</h1></div>');
      for(const link of grid.querySelectorAll('a.routine-detail-link'))link.textContent='Open Routine';
      for(const video of grid.querySelectorAll('video[poster]')){
        const poster=document.createElement('img');poster.className=video.className;poster.src=video.poster;poster.alt='';poster.loading='lazy';video.replaceWith(poster);
      }
      document.querySelectorAll('.store-heading').forEach(node => node.remove());
    } else {
      const main=document.querySelector('main');
      const path=/^\/routines\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
      const entry=packRoutines.findIndex(([,id,name])=>id===path||name===path);
      if(main&&entry>=0){
        const number=entry+1;
        main.dataset.routineSlug=packRoutines[entry][1];
        document.title=packRoutines[entry][0]+' — MUKVIK';
        const source=freePackSlugs.has(packRoutines[entry][1])?'data-free-pack-video':'poster="/assets/lesson-previews/pack-'+number+'-blurred.jpg" src="/assets/lesson-previews/pack-'+number+'-blurred.mp4"';
        main.innerHTML='<section class="routine-detail-panel"><p><a href="/routines/">Routines</a></p><h1></h1><video class="routine-detail-video" controls playsinline preload="none" '+source+'></video></section>';
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
        addRoutinePager(section);
      }
      main?.insertAdjacentHTML('beforeend',plan(false));
    }
  }

  // The plan is inserted by this script, so restore a direct link even when
  // the browser looked for the fragment before the section existed.
  const hash = location.hash;
  if (/^#(?:standard-plan|free-routines|routine-0[1-6])$/.test(hash)) {
    requestAnimationFrame(() => {
      if (location.hash === hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    });
  }
})();
