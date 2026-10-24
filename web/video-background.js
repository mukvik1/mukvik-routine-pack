(() => {
 const video=document.querySelector('.rp-hero-background');
 if(!video||!document.querySelector('.rp-home'))return;
 const heading=document.querySelector('#lessons .rp-section-top');
 const hero=document.querySelector('.rp-hero');
 if(!hero)return;
 const layer=document.createElement('div');layer.className='rp-wide-background';layer.setAttribute('aria-hidden','true');
 document.body.classList.add('rp-video-wide');document.body.prepend(layer);layer.append(video);
 const resize=()=>{const end=heading||hero;layer.style.height=Math.ceil(end.getBoundingClientRect().bottom+window.scrollY+40)+'px';};
 resize();window.addEventListener('resize',resize,{passive:true});
 if('ResizeObserver'in window){const observer=new ResizeObserver(resize);[document.querySelector('.site-header'),hero,heading].filter(Boolean).forEach(x=>observer.observe(x));}
 document.fonts?.ready.then(resize);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true;
 const sync=()=>{if(reduced.matches||navigator.connection?.saveData||document.hidden||!visible){video.pause();return;}video.muted=true;if(!video.getAttribute('src'))video.src=video.dataset.backgroundSrc;video.play().catch(()=>{});};
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});observer.observe(layer);}
 sync();
})();
