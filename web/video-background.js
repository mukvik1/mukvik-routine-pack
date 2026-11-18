(() => {
 if(window.parent!==window && window.name==='rp-content-frame'){
   document.documentElement.classList.add('rp-embedded-page');
   document.body.classList.add('rp-video-wide','rp-video-pages');
   document.querySelectorAll('.rp-hero-background').forEach(v=>{v.pause();v.removeAttribute('src');v.remove();});
   document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!a||a.target==='_blank'||a.matches('[download],[data-routine-download],[data-direct-download]'))return;const u=new URL(a.href,location.href);if(/^https?:$/.test(u.protocol)&&u.origin!==location.origin){event.preventDefault();window.top.location.assign(u.href);}else if(u.origin===location.origin&&u.pathname!==location.pathname&&!a.hasAttribute('data-direct-download')){event.preventDefault();event.stopImmediatePropagation();window.parent.RPBackgroundNavigate(u.href);}},true);
   return;
 }
 const home=!!document.querySelector('.rp-home');
 if(!home&&!/^\/(price|routines|free|about|legal)(\/|$)/.test(location.pathname))return;
 let video=document.querySelector('.rp-hero-background');
 if(!video){video=document.createElement('video');video.className='rp-hero-background';video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='none';video.poster='/assets/videos/poster-1.jpg';video.dataset.backgroundSrc='/assets/videos/hero-background.mp4';video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;}
 const heading=document.querySelector('.rp-software');
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
 const initialURL=location.href,initialTitle=document.title;let frame=null,pending=null,initialScroll=0;
 const allowed=url=>url.origin===location.origin && /^\/(?:price|routines|free|about|legal\/(?:seller|privacy|terms|refunds|delivery))?\/?$/.test(url.pathname);
 function showFrame(url,fromHistory=false){
   pending?.remove();
   if(!frame)initialScroll=scrollY;
   const next=document.createElement('iframe');
   pending=next;next.name='rp-content-frame';next.className='rp-content-frame rp-frame-pending';
   next.title='Routine Pack';next.setAttribute('allow','autoplay; fullscreen');
   next.setAttribute('aria-hidden','true');next.inert=true;
   next.addEventListener('load',async()=>{
     if(pending!==next)return;
     let href,title;
     try{
       const child=next.contentWindow;
       if(child.location.href==='about:blank')return;
       await child.RP_I18N?.ready;
       child.RP_I18N?.apply?.();
       href=child.location.href;title=child.document.title;
     }catch{
       if(pending===next){next.remove();pending=null;}
       return;
     }
     if(pending!==next)return;
     document.querySelectorAll('dialog[open]').forEach(d=>d.close());
     const previous=frame;
     frame=next;pending=null;
     document.body.classList.add('rp-navigation-shell');
     window.scrollTo(0,0);
     next.classList.remove('rp-frame-pending');next.removeAttribute('aria-hidden');next.inert=false;
     previous?.remove();
     if(!fromHistory&&href!==location.href)history.pushState({rpPage:true},'',href);
     document.title=title||initialTitle;
     sync();
   });
   next.src=url;
   document.body.append(next);
 }
 window.RPBackgroundNavigate=url=>{const u=new URL(url,location.href);if(u.origin===location.origin)showFrame(u.href);};
 document.addEventListener('click',event=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const a=event.target.closest?.('a[href]');if(!a||a.target||a.matches('[download],[data-routine-download],[data-direct-download]'))return;
   const url=new URL(a.href,location.href);if(!allowed(url)||url.href===location.href||(url.pathname===location.pathname&&url.hash))return;
   event.preventDefault();event.stopImmediatePropagation();showFrame(url.href);
 },true);
 window.addEventListener('popstate',()=>{
   if(!frame&&!pending)return;
   if(location.href===initialURL){
     pending?.remove();pending=null;
     frame?.remove();frame=null;
     document.body.classList.remove('rp-navigation-shell');document.title=initialTitle;
     window.scrollTo(0,initialScroll);resize();sync();
   }else showFrame(location.href,true);
 });
})();
