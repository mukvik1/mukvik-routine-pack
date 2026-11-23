(() => {
 const supported=['en','uk','de','es','th','id','ar','hi','it','pt-BR','ko','vi','zh-CN','ja','nl','pl'];
 const stored=()=>{try{return localStorage.getItem('routinepack_language');}catch{return null;}};
 const requested=new URLSearchParams(location.search).get('lang');
 let language=supported.includes(requested)?requested:(supported.includes(stored())?stored():'en');
 let messages={en:{},uk:{}};
 const t=key=>{
  if(typeof key!=='string')return key;
  const entry=messages[language]?.[key] || messages.en[key];
  if(entry)return entry;
  const count=key.match(/\b\d+\b/);
  const template=count&&messages[language]?.[key.replace(count[0],'{count}')];
  return template?template.replace('{count}',count[0]):key;
 };
 function apply(notify=true){
  document.documentElement.lang=language;
  document.documentElement.dir=language==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  for(const attr of ['title','alt','aria-label','placeholder','content','data-product-description'])document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>{el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`)));});
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  document.querySelectorAll('[data-language-select]').forEach(select=>{select.value=language;});
  if(notify)document.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
 }
 function set(value){
  if(!supported.includes(value))return;
  language=value;
  try{localStorage.setItem('routinepack_language',value);}catch{}
  const url=new URL(location.href);
  if(url.searchParams.has('lang')){
   url.searchParams.set('lang',value);history.replaceState(history.state,'',url);
  }
  apply();
 }
 if(supported.includes(requested))try{localStorage.setItem('routinepack_language',language);}catch{}
 document.documentElement.lang=language;
 document.documentElement.dir=language==='ar'?'rtl':'ltr';
 window.addEventListener('storage',event=>{
  if(event.key==='routinepack_language'&&supported.includes(event.newValue)&&event.newValue!==language){
   language=event.newValue;apply();
  }
 });
 const ready=fetch('/messages.json?v=17').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{messages=data;}).catch(()=>{}).then(()=>apply());
 window.RP_I18N={t,set,ready,apply:()=>apply(false),get language(){return language;}};
 for(const select of document.querySelectorAll('[data-language-select]')){
  for(const [locale,label] of [['ko','🇰🇷 한국어'],['vi','🇻🇳 Tiếng Việt'],['zh-CN','🇨🇳 简体中文'],['ja','🇯🇵 日本語'],['nl','🇳🇱 Nederlands'],['pl','🇵🇱 Polski']]){
   if(!Array.from(select.options).some(option=>option.value===locale)){
    const option=document.createElement('option');option.value=locale;option.lang=locale;option.textContent=label;select.append(option);
   }
  }
  select.value=language;
  if(!('showPopover' in HTMLElement.prototype))continue;
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='rp-language-trigger';
  trigger.setAttribute('aria-label','Languages');trigger.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');
  panel.className='rp-language-panel';panel.popover='auto';
  panel.id='rp-language-options-'+document.querySelectorAll('.rp-language-panel').length;
  trigger.setAttribute('aria-controls',panel.id);
  const update=()=>{trigger.textContent=select.selectedOptions[0]?.textContent||language;};
  for(const option of select.options){
   const item=document.createElement('button');
   item.type='button';item.lang=option.lang||option.value;
   item.textContent=option.textContent;item.dataset.language=option.value;
   item.addEventListener('click',()=>{set(option.value);panel.hidePopover();trigger.focus();});
   panel.append(item);
  }
  const position=()=>{
   const box=trigger.getBoundingClientRect(),width=Math.min(240,innerWidth-16);
   const below=innerHeight-box.bottom-16,above=box.top-16;
   const down=below>=160||below>=above;
   panel.style.width=width+'px';
   panel.style.left=Math.max(8,Math.min(box.right-width,innerWidth-width-8))+'px';
   panel.style.maxHeight=Math.max(40,Math.min(320,down?below:above))+'px';
   panel.style.top=down?box.bottom+8+'px':'auto';
   panel.style.bottom=down?'auto':innerHeight-box.top+8+'px';
  };
  trigger.addEventListener('click',()=>{
   if(panel.matches(':popover-open'))panel.hidePopover();
   else{position();panel.showPopover();panel.scrollTop=0;panel.firstElementChild.focus({preventScroll:true});}
  });
  panel.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(panel.matches(':popover-open'))));
  window.addEventListener('resize',()=>{if(panel.matches(':popover-open'))position();});
  document.addEventListener('scroll',event=>{if(event.target!==panel&&panel.matches(':popover-open'))position();},true);
  document.addEventListener('languagechange',update);
  select.hidden=true;select.after(trigger);document.body.append(panel);update();
 }
 document.querySelectorAll('[data-language-select]').forEach(select=>select.addEventListener('change',()=>set(select.value)));
 document.querySelectorAll('[data-language]:not(.rp-language-panel button)').forEach(b=>b.addEventListener('click',()=>set(b.dataset.language)));
})();
