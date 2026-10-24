(() => {
 if(window.parent!==window && window.name==='rp-content-frame'){
   document.documentElement.classList.add('rp-embedded-page');
   document.body.classList.add('rp-video-wide','rp-video-pages');
   document.querySelectorAll('.rp-hero-background').forEach(v=>{v.pause();v.removeAttribute('src');v.remove();});
   document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(/^https?:$/.test(u.protocol)&&u.origin!==location.origin){event.preventDefault();window.top.location.assign(u.href);}else if(u.origin===location.origin&&u.pathname!==location.pathname&&!a.hasAttribute('data-direct-download')){event.preventDefault();event.stopImmediatePropagation();window.parent.RPBackgroundNavigate(u.href);}},true);
   return;
 }
 const home=!!document.querySelector('.rp-home');
 if(!home&&!/^\/(packs|routines|free|about)(\/|$)/.test(location.pathname))return;
 let video=document.querySelector('.rp-hero-background');
 if(!video){video=document.createElement('video');video.className='rp-hero-background';video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='none';video.poster='/assets/videos/poster-1.jpg';video.dataset.backgroundSrc='/assets/videos/hero-background.mp4';video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;}
 const heading=document.querySelector('#lessons .rp-section-top');
 const hero=document.querySelector('.rp-hero');

 const layer=document.createElement('div');layer.className='rp-wide-background';layer.setAttribute('aria-hidden','true');
 document.body.classList.add('rp-video-wide');if(!home)document.body.classList.add('rp-video-pages');document.body.prepend(layer);layer.append(video);
 const resize=()=>{if(!home)return;const end=heading||hero;layer.style.height=Math.ceil(end.getBoundingClientRect().bottom+window.scrollY+40)+'px';};
 resize();window.addEventListener('resize',resize,{passive:true});
 if('ResizeObserver'in window){const observer=new ResizeObserver(resize);[document.querySelector('.site-header'),hero,heading].filter(Boolean).forEach(x=>observer.observe(x));}
 document.fonts?.ready.then(resize);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true;
 const sync=()=>{if(reduced.matches||navigator.connection?.saveData||document.hidden||!visible){video.pause();return;}video.muted=true;if(!video.getAttribute('src'))video.src=video.dataset.backgroundSrc;video.play().catch(()=>{});};
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(layer);}
 sync();
 // Keep the video document alive while each page retains its own scripts and account flow.
 const initialURL=location.href,initialTitle=document.title;let frame=null,historyNavigation=false,initialScroll=0;
 const allowed=url=>url.origin===location.origin && /^\/(?:packs|routines|free|about)?\/?$/.test(url.pathname);
 function showFrame(url){
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());
   if(!frame){
     initialScroll=scrollY;frame=document.createElement('iframe');frame.name='rp-content-frame';frame.className='rp-content-frame';frame.title='Routine Pack';frame.setAttribute('allow','autoplay; fullscreen');
     frame.addEventListener('load',()=>{
       let href,title;try{href=frame.contentWindow.location.href;title=frame.contentDocument.title;}catch{return;}
       if(href==='about:blank')return;
       if(!historyNavigation&&href!==location.href)history.pushState({rpPage:true},'',href);
       historyNavigation=false;document.title=title||initialTitle;
     });
     document.body.append(frame);
   }
   document.body.classList.add('rp-navigation-shell');
   window.scrollTo(0,0);if(frame.getAttribute('src'))frame.contentWindow.location.replace(url);else frame.src=url;sync();
 }
 window.RPBackgroundNavigate=url=>{const u=new URL(url,location.href);if(u.origin===location.origin)showFrame(u.href);};
 document.addEventListener('click',event=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const a=event.target.closest?.('a[href]');if(!a||a.target||a.hasAttribute('download'))return;
   const url=new URL(a.href,location.href);if(!allowed(url)||url.href===location.href||(url.pathname===location.pathname&&url.hash))return;
   event.preventDefault();event.stopImmediatePropagation();showFrame(url.href);
 },true);
 window.addEventListener('popstate',()=>{
   if(!frame)return;
   if(location.href===initialURL){
     document.body.classList.remove('rp-navigation-shell');frame.remove();frame=null;document.title=initialTitle;window.scrollTo(0,initialScroll);resize();sync();
   }else{historyNavigation=true;showFrame(location.href);}
 });
})();
