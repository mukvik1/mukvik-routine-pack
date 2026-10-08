(() => {
 const stored=()=>{try{return localStorage.getItem('routinepack_language');}catch{return null;}};
 const requested=new URLSearchParams(location.search).get('lang');
 let language=['en','uk'].includes(requested)?requested:(stored()==='uk'?'uk':'en');
 let messages={en:{},uk:{}};
 const t=key=>messages[language]?.[key] || messages.en[key] || key;
 function apply(){
  document.documentElement.lang=language;
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  for(const attr of ['title','alt','aria-label','placeholder','content','data-product-description'])document.querySelectorAll(`[data-i18n-${attr}]`).forEach(el=>{el.setAttribute(attr,t(el.getAttribute(`data-i18n-${attr}`)));});
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  document.dispatchEvent(new CustomEvent('languagechange',{detail:language}));
 }
 function set(value){if(!['en','uk'].includes(value))return;language=value;try{localStorage.setItem('routinepack_language',value);}catch{}apply();}
 const ready=fetch('/messages.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{messages=data;apply();});
 window.RP_I18N={t,set,ready,get language(){return language;}};
 document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>set(b.dataset.language)));
})();
