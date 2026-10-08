(async()=>{
 const i18n=window.RP_I18N;
 const config=await fetch('/merchant-config.json').then(r=>r.json());
 await i18n.ready;
 function show(){document.querySelectorAll('[data-merchant]').forEach(el=>{
  const v=config[el.dataset.merchant];
  el.textContent=(v && typeof v==='object'?v[i18n.language]:v)||i18n.t('[To be supplied]');
 });}
 show();document.addEventListener('languagechange',show);
})();
