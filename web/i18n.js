(() => {
 const supported=['en','uk','de','es','th','id','ar','hi','it','pt-BR'];
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
 const ready=fetch('/messages.json?v=14').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{messages=data;}).catch(()=>{}).then(()=>apply());
 window.RP_I18N={t,set,ready,apply:()=>apply(false),get language(){return language;}};
 document.querySelectorAll('[data-language-select]').forEach(select=>select.addEventListener('change',()=>set(select.value)));
 document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>set(b.dataset.language)));
})();
