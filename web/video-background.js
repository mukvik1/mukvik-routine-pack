(() => {
 const home = document.querySelector('.rp-home');
 const hero = home?.querySelector('.rp-hero');
 if (!hero && !/^\/(price|routines|free|about)(\/|$)/.test(location.pathname)) return;

 const video = hero?.querySelector('.rp-hero-background');
 const layer = document.createElement('div');
 layer.className = 'rp-wide-background';
 layer.setAttribute('aria-hidden', 'true');
 document.body.classList.add('rp-video-wide', hero ? 'rp-video-home' : 'rp-video-pages');
 document.body.prepend(layer);
 if (!hero) return;

 if (video) layer.append(video);
 // Keep the poster in place even when the background video is not playing.
 const resize = () => {
   const bottom = Math.ceil(hero.getBoundingClientRect().bottom + window.scrollY + 40);
   const height = bottom + 'px';
   if (layer.style.height !== height) layer.style.height = height;
 };
 resize();
 if ('ResizeObserver' in window) {
   const observer = new ResizeObserver(resize);
   [document.querySelector('.site-header'), hero].filter(Boolean).forEach(node => observer.observe(node));
 } else {
   window.addEventListener('resize', resize, { passive: true });
 }
 if (!video) return;

 const desktop = matchMedia('(min-width: 1000px) and (hover: hover) and (pointer: fine)');
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 let visible = !('IntersectionObserver' in window);
 const sync = () => {
   if (!desktop.matches || reduced.matches || navigator.connection?.saveData) {
     video.pause();
     if (video.hasAttribute('src')) {
       video.removeAttribute('src');
       video.load();
     }
     return;
   }
   if (!visible || document.hidden) {
     video.pause();
     return;
   }
   const source = video.dataset.backgroundSrc;
   if (!source) return;
   if (!video.hasAttribute('src')) video.src = source;
   video.muted = true;
   if (video.paused) video.play().catch(() => {});
 };
 video.removeAttribute('autoplay');
 for (const query of [desktop, reduced]) query.addEventListener('change', sync);
 document.addEventListener('visibilitychange', sync);
 window.addEventListener('pagehide', () => video.pause());
 window.addEventListener('pageshow', sync);
 if ('IntersectionObserver' in window) {
   const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
   observer.observe(layer);
 }
 sync();
})();
