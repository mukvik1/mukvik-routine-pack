(async()=>{
'use strict';
await window.RP_I18N.ready;
const API='https://mukvik-routine-pack-production.up.railway.app';
const accountMessages={"ar":{"Please wait…":"يرجى الانتظار…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"ادفع بأمان بالهريفنيا. يظهر سعر الصرف والمبلغ النهائي قبل الدفع.","Pay":"ادفع","Order saved. You can pay from your account.":"تم حفظ الطلب. يمكنك الدفع من حسابك."},"hi":{"Please wait…":"कृपया प्रतीक्षा करें…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"UAH में सुरक्षित भुगतान करें। अंतिम विनिमय दर और राशि भुगतान से पहले दिखाई जाती हैं।","Pay":"भुगतान करें","Order saved. You can pay from your account.":"ऑर्डर सहेज लिया गया। आप अपने अकाउंट से भुगतान कर सकते हैं।"},"it":{"Please wait…":"Attendi…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"Paga in sicurezza in UAH. Il cambio e l'importo finale sono indicati prima del pagamento.","Pay":"Paga","Order saved. You can pay from your account.":"Ordine salvato. Puoi pagare dal tuo account."},"pt-BR":{"Please wait…":"Aguarde…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"Pague com segurança em UAH. A taxa de câmbio e o valor final são exibidos antes do pagamento.","Pay":"Pagar","Order saved. You can pay from your account.":"Pedido salvo. Você pode pagar pela sua conta."}};
const removeLabels={en:'Remove unpaid order',uk:'Видалити неоплачене замовлення',de:'Unbezahlte Bestellung entfernen',es:'Eliminar pedido sin pagar',th:'ลบคำสั่งซื้อที่ยังไม่ได้ชำระเงิน',id:'Hapus pesanan belum dibayar',ar:'إزالة الطلب غير المدفوع',hi:'अवैतनिक ऑर्डर हटाएँ',it:'Rimuovi ordine non pagato','pt-BR':'Remover pedido não pago'};
accountMessages.uk={...accountMessages.uk,'Free downloads':'Завантаження Free','No downloads yet.':'Завантажень поки немає.','Completed downloads':'Завершені завантаження','Delivery attempts':'Спроби завантаження','Last download':'Останнє завантаження','Latest 100 customer/routine totals':'Останні 100 підсумків за користувачами та рутинами','Confirm your email before downloading. Register or reset your password to confirm it.':'Підтвердіть email перед завантаженням. Зареєструйтеся або відновіть пароль для підтвердження.'};
for(const [language,label] of Object.entries(removeLabels)){accountMessages[language]??={};accountMessages[language]['Remove unpaid order']=label;}
const T=k=>accountMessages[window.RP_I18N.language]?.[k]||window.RP_I18N.t(k),money=n=>new Intl.NumberFormat(window.RP_I18N.language,{style:'currency',currency:'USD'}).format(n/100);
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}},write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}};
let publicStandardPlan=null,standardPlan=null,standardAccess=null,standardGeneration=0,videoGeneration=0;
let token=read('mukvik_store_session'),user=null,challenge=null,mode='login',providers={};
const accountQuery=new URLSearchParams(location.search);
const orderId=accountQuery.get('orderId');
const returnedOrder=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId||'')?orderId:null;
let accountRequested=accountQuery.get('account')==='1';
let pendingFree=null,pendingRoutine=null;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls='store-button')=>{const b=el('button',T(label),cls);b.type='button';b.addEventListener('click',fn);return b;};
function dialog(id,title){const d=el('dialog',undefined,'store-dialog');d.id=id;const head=el('div',undefined,'store-dialog-head'),h=el('h2',T(title));h.dataset.title=title;const close=button('Close',()=>d.close(),'store-close');close.textContent='×';close.setAttribute('aria-label',T('Close'));head.append(h,close);d.append(head);d.setAttribute('aria-labelledby',id+'-title');h.id=id+'-title';d.addEventListener('click',e=>{if(e.target===d)d.close();});document.body.append(d);return d;}
const auth=dialog('store-auth','SIGN IN'),account=dialog('store-cabinet','Your account');
const error=el('p','','store-error');error.setAttribute('role','alert');
const authTabs=el('div',undefined,'store-tabs');authTabs.append(button('SIGN IN',()=>{mode='login';challenge=null;renderAuth();}),button('SIGN UP',()=>{mode='register';challenge=null;renderAuth();}));
const authBody=el('div');auth.append(authTabs,authBody,error);
function show(d){for(const other of [auth,account])if(other!==d&&other.open)other.close();if(!d.open)d.showModal();}
async function api(path,method='GET',data){const r=await fetch(API+'/api/v2'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});let body;try{body=await r.json();}catch{throw Error(T('Service temporarily unavailable.'));}if(!r.ok){if(r.status===401){token=null;user=null;standardPlan=publicStandardPlan;standardAccess=null;standardGeneration++;write('mukvik_store_session',null);window.RPAccountHeader?.clear();renderHeader();}throw Error(T(body.error||'Service temporarily unavailable.')+(body.paymentCode?' ['+body.paymentCode+']':''));}return body;}
function renderAuth(){
 error.textContent='';authBody.replaceChildren();
 const registration=mode==='register',reset=mode==='reset';
 auth.querySelector('h2').textContent=T(challenge?'Confirm your email':reset?'RESET PASSWORD':registration?'SIGN UP':'SIGN IN');
 authTabs.hidden=Boolean(challenge)||reset;
 authTabs.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String((i===1)===registration)));
 if(challenge){
  const form=el('form'),label=el('label',T('Confirmation code')),input=el('input');
  input.required=true;input.pattern='[0-9]{8}';input.maxLength=8;input.inputMode='numeric';input.autocomplete='one-time-code';label.append(input);form.append(el('p',T('Enter the code sent to your email.')+' '+challenge.email,'store-muted'),label);
  let newPassword;
  if(challenge.kind==='reset'){const pass=el('label',T('New password'));newPassword=el('input');newPassword.type='password';newPassword.required=true;newPassword.minLength=8;pass.append(newPassword);form.append(pass);}
  const submit=el('button',T('CONFIRM'),'store-button primary');submit.type='submit';form.append(submit);
  form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{
   const kind=challenge.kind;
   const result=await api('/auth/password/'+kind+'/confirm','POST',{challengeId:challenge.id,code:input.value.trim(),...(newPassword?{password:newPassword.value}:{})});
   challenge=null;
   if(kind==='register'){await finishLogin(result.accessToken);await afterLogin();}
   else{mode='login';renderAuth();error.textContent=T('Password updated. Sign in with your new password.');}
  }catch(e){error.textContent=e.message;}finally{submit.disabled=false;}});
  form.append(button('Change email',()=>openAuth(mode),'store-text-button'));authBody.append(form);return;
 }
 const form=el('form');
 const emailLabel=el('label',T('Email')),email=el('input');email.type='email';email.required=true;email.autocomplete='email';emailLabel.append(email);form.append(emailLabel);
 let nickname;
 if(registration){const label=el('label',T('Nickname'));nickname=el('input');nickname.required=true;nickname.maxLength=40;label.append(nickname);form.append(label);}
 const passLabel=el('label',T(reset?'New password':'Password')),password=el('input');password.type='password';password.required=!reset;password.minLength=8;password.autocomplete=registration?'new-password':'current-password';
 if(!reset){passLabel.append(password);form.append(passLabel);}
 const submit=el('button',T(reset?'SEND CODE':registration?'SIGN UP':'SIGN IN'),'store-button primary');submit.type='submit';form.append(submit);
 form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{
  if(mode==='login'){const result=await api('/auth/password/login','POST',{email:email.value,password:password.value});await finishLogin(result.accessToken);await afterLogin();}
  else{const kind=reset?'reset':'register';const result=await api('/auth/password/'+kind+'/start','POST',{email:email.value,...(!reset?{password:password.value,nickname:nickname?.value||''}:{})});challenge={id:result.challengeId,email:email.value,kind};renderAuth();}
 }catch(err){error.textContent=err.message;}finally{submit.disabled=false;}});
 authBody.append(form);
 if(!registration&&!reset)authBody.append(button('Forgot password?',()=>{mode='reset';renderAuth();},'store-text-button'));
 if(reset)authBody.append(button('Back to sign in',()=>{mode='login';renderAuth();},'store-text-button'));
}
const freeStatus=el('p','','store-muted');freeStatus.setAttribute('role','status');document.querySelector('.free-catalog')?.append(freeStatus);
async function afterLogin(){
 const routine=pendingRoutine;
 auth.close();
 if(pendingFree){const slug=pendingFree;pendingFree=null;await downloadFree(slug);return;}
 if(accountRequested){await openRequestedAccount();return;}
 if(routine){pendingRoutine=null;location.assign(routine);return;}
 renderAccount();
 show(account);
}
async function downloadFree(slug){
 if(!user){pendingFree=slug;openAuth('register');return;}
 freeStatus.textContent=T('Please wait…');
 try{
  const response=await fetch(API+'/api/v2/free/'+encodeURIComponent(slug)+'/download',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(response.status===401){token=null;user=null;standardPlan=publicStandardPlan;standardAccess=null;standardGeneration++;write('mukvik_store_session',null);window.RPAccountHeader?.clear();renderHeader();pendingFree=slug;openAuth('login');freeStatus.textContent='';return;}
  if(response.status===403){const result=await response.json();if(result.code==='EMAIL_VERIFICATION_REQUIRED'){pendingFree=slug;openAuth('register');error.textContent=T(result.error);freeStatus.textContent='';return;}}
  if(!response.ok||!String(response.headers.get('content-type')).startsWith('application/zip'))throw Error(T('Service temporarily unavailable.'));
  const blob=await response.blob(),href=URL.createObjectURL(blob),a=el('a');a.href=href;a.download=slug+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
  freeStatus.textContent=T('Download started. Save the ZIP file.');
 }catch(e){freeStatus.textContent=e.message;}
}
document.addEventListener('click',event=>{
 const link=event.target.closest?.('a[data-direct-download]');if(!link)return;
 event.preventDefault();event.stopImmediatePropagation();
 const url=new URL(link.href),match=/^\/downloads\/([a-z0-9-]+)\.zip$/.exec(url.pathname);
 if(match)downloadFree(match[1]);
},true);
function openAuth(value='login'){mode=value;challenge=null;renderAuth();show(auth);}
function memberLevel(){
 if(!user)return null;
 if(user.admin)return 'Admin';
 if(!standardAccess?.active||+new Date(standardAccess.paidUntil)<=Date.now())return 'Free';
 return standardAccess.tier==='standard'?'Pro':'Ultra';
}
const watchWithoutAccount=button('Continue watching',()=>{
 const href=pendingRoutine;pendingRoutine=null;auth.close();
 if(href)location.assign(href);
},'store-text-button rp-watch-guest');
watchWithoutAccount.hidden=true;auth.append(watchWithoutAccount);
auth.addEventListener('close',()=>{pendingRoutine=null;watchWithoutAccount.hidden=true;});
window.addEventListener('click',event=>{
 if(user||token||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('a.routine-detail-link[href]');
 if(!link)return;
 const target=new URL(link.href,location.href);
 if(target.origin!==location.origin||!/^\/(routines|free)\/[a-z0-9-]+\/?$/.test(target.pathname))return;
 event.preventDefault();event.stopImmediatePropagation();
 pendingRoutine=target.href;watchWithoutAccount.hidden=false;openAuth('register');
},true);
function renderHeader(){
 renderStandard();
 if(user&&(user.admin||standardAccess||!standardPlan))window.RPAccountHeader?.save(token,user.nickname,memberLevel());
 document.querySelectorAll('[data-store-auth]').forEach(box=>{
  if(!user&&token)return;
  box.dataset.rpAuthReady='';
  box.removeAttribute('aria-busy');
  box.replaceChildren();
  if(!user){box.append(button('SIGN IN',()=>openAuth()),button('SIGN UP',()=>openAuth('register'),'store-button primary'));}
  else{const menu=el('details',undefined,'store-user-menu'),summary=el('summary');summary.title=user.email;summary.append(el('span',user.nickname||user.email,'rp-member-name'),el('span',memberLevel(),'rp-member-tier'));const entries=el('div',undefined,'store-user-entries');entries.append(button('Your account',()=>{menu.open=false;renderAccount();show(account);}),button('Sign out',async()=>{try{await api('/auth/logout','POST',{});token=null;user=null;standardPlan=publicStandardPlan;standardAccess=null;standardGeneration++;write('mukvik_store_session',null);window.RPAccountHeader?.clear();renderHeader();account.close();}catch(e){accountStatus.textContent=e.message;renderAccount();show(account);}}));menu.append(summary,entries);box.append(menu);}
 });
}
async function finishLogin(access){
 window.RPAccountHeader?.clear();
 token=access;write('mukvik_store_session',token);
 user=await api('/me');await refreshStandard();renderHeader();
}
const accountBody=el('div'),accountStatus=el('p','','store-error');accountStatus.setAttribute('role','status');account.append(accountStatus,accountBody);
async function openRequestedAccount(){
 if(!user){openAuth('login');return;}
 accountRequested=false;
 renderAccount();show(account);
 const order=user.orders.find(o=>o.id===returnedOrder);
 if(order?.status!=='awaiting_manual_review')return;
 accountStatus.textContent=T('Checking your payment…');
 try{
  await api('/orders/'+returnedOrder+'/monobank/status');
  user=await api('/me');renderAccount();
  accountStatus.textContent='';
 }catch{
  if(!user){accountRequested=true;openAuth('login');return;}
  accountStatus.textContent=T('Payment status is temporarily unavailable. Please use Refresh to check again.');
 }
}
function renderAccount(){account.querySelector('h2').textContent=T('Your account');accountBody.replaceChildren();if(!user)return;accountBody.append(el('p',user.email,'store-muted'));
 {
  const section=el('section',undefined,'store-order');
  const level=memberLevel();
  section.append(el('h3',level==='Admin'?'Admin access':level+' membership'),el('p',level==='Admin'?'You have administrative access.':level==='Free'?(standardAccess?.pending?'Payment pending. Your Free membership is active.':'Your Free membership is active.'):('Downloads available until '+new Date(standardAccess.paidUntil).toLocaleDateString()),'store-muted'));
  if(standardAccess?.cancelled)section.append(el('p','Auto-renewal is off.'));
  if(standardAccess?.cancellable){
   const cancel=button('Cancel auto-renewal',async()=>{
    if(!confirm('Cancel auto-renewal? You can still download until the end of your paid period.'))return;
    cancel.disabled=true;
    try{standardAccess=await api('/standard/cancel','POST',{});renderHeader();renderAccount();}catch(e){accountStatus.textContent=e.message;cancel.disabled=false;}
   });
   section.append(cancel);
  }
  accountBody.append(section);
 }
 accountBody.append(el('h3',T('Your orders')));
 if(!user.orders.length)accountBody.append(el('p',T('No orders yet.'),'store-muted'));
 for(const order of user.orders){const block=el('section',undefined,'store-order');block.append(el('strong',T('Order')+' '+order.id.slice(0,8)),el('p',T(order.status==='approved'?'Approved':order.status==='awaiting_manual_review'?'Awaiting payment confirmation':order.status==='cancelled'?'Cancelled':'Refunded'),'store-muted'));
  for(const item of order.items){block.append(el('p',item.name));for(const file of item.files||[]){const b=button('Download',async()=>{b.disabled=true;try{const r=await api('/orders/'+order.id+'/files/'+item.code+'/'+file.index+'/ticket','POST',{});const u=new URL(r.url,API);if(u.origin!==API)throw Error(T('Service temporarily unavailable.'));const a=el('a');a.href=u.href;a.download='';document.body.append(a);a.click();a.remove();}catch(e){accountStatus.textContent=e.message;}finally{b.disabled=false;}});b.textContent=T('Download')+' · '+file.name;block.append(b);}}
  block.append(el('strong',money(order.totalCents)));
  if(order.status==='awaiting_manual_review'||order.status==='cancelled'){
   const remove=button('Remove unpaid order',async()=>{remove.disabled=true;accountStatus.textContent='';try{await api('/orders/'+order.id+'/hide','POST',{});user=await api('/me');renderAccount();}catch(e){accountStatus.textContent=e.message;remove.disabled=false;}});
   block.append(remove);
  }accountBody.append(block);
 }
 accountBody.append(button('Refresh',async()=>{try{for(const o of user.orders.filter(x=>x.status==='awaiting_manual_review'))await api('/orders/'+o.id+'/monobank/status');user=await api('/me');renderAccount();}catch(e){accountStatus.textContent=e.message;}}));
 if(user.admin){
  const report=el('div');
  const load=button('Free downloads',async()=>{
   load.disabled=true;accountStatus.textContent='';
   try{
    const result=await api('/admin/free-downloads');report.replaceChildren(el('h3',T('Free downloads')),el('p',T('Latest 100 customer/routine totals'),'store-muted'));
    if(!result.totals.length)report.append(el('p',T('No downloads yet.')));
    for(const row of result.totals){
     const block=el('section',undefined,'store-order');
     block.append(el('strong',row.routine_name),el('p',row.email),el('p',T('Completed downloads')+': '+row.completed_downloads+' · '+T('Delivery attempts')+': '+row.downloads),el('p',T('Last download')+': '+new Date(row.last_download_at).toLocaleString(window.RP_I18N.language)));
     report.append(block);
    }
   }catch(e){accountStatus.textContent=e.message;}finally{load.disabled=false;}
  });
  accountBody.append(load,report);
 }
}
async function refreshStandard(force=false){
 const generation=++standardGeneration;
 if(!user){standardAccess=null;standardPlan=publicStandardPlan;return;}
 if(user.admin&&!standardPlan){
  try{const plan=await api('/standard/plan');if(generation===standardGeneration)standardPlan=plan;}catch{}
 }
 if(!standardPlan||generation!==standardGeneration){return;}
 try{
  const value=await api('/standard'+(force?'?refresh=1':''));
  if(generation===standardGeneration)standardAccess=value;
 }catch{if(generation===standardGeneration)standardAccess=null;}
}
function renderMembershipOffers(){
 const level=memberLevel();
 for(const section of document.querySelectorAll('.rp-plan-tiers')){
  let visible=0;
  for(const offer of section.querySelectorAll('.rp-plan-offer')){
   const tier=offer.dataset.planTier;
   const showOffer=!level?!token:level==='Free'?Boolean(tier):level==='Pro'&&tier==='pro';
   offer.hidden=!showOffer;
   if(showOffer)visible++;
   if(!tier&&!offer.querySelector('[data-free-join]')){
    const join=button('Create your Free account',()=>openAuth('register'),'store-button primary');
    join.dataset.freeJoin='';offer.querySelector('a')?.replaceWith(join);
   }
  }
  section.dataset.visiblePlans=String(visible);
  const title=section.querySelector('.rp-plan-copy h2'),copy=section.querySelector('.rp-plan-copy>p:last-child');
  if(title)title.textContent=!level?(token?'Checking membership…':'Choose your plan.'):level==='Free'?'Upgrade your plan.':level==='Pro'?'Upgrade to Ultra.':level==='Ultra'?'You’re on Ultra.':'Admin access.';
  if(copy)copy.textContent=!level?(token?'Please wait.':'Choose the access that fits your sets. Watch previews anytime.'):level==='Free'?'Free is active. Choose Pro or Ultra for more downloads.':level==='Pro'?'Ultra is the next level and includes the full library.':level==='Ultra'?'You already have the highest membership level.':'Subscription purchases are not offered to administrators.';
 }
}
function renderStandard(){
 renderMembershipOffers();
 const playbackEpoch=++videoGeneration;
 const player=document.querySelector('.routine-detail-panel video[data-free-pack-video],.routine-detail-panel video[src*="-blurred.mp4"],.routine-detail-panel video[data-blurred-src]');
 const restorePreview=()=>{
  if(player?.hasAttribute('data-free-pack-video')&&player.hasAttribute('src')){
   player.pause();player.removeAttribute('src');player.load();delete player.dataset.fullVideo;
   return;
  }
  if(player?.dataset.blurredSrc&&player.getAttribute('src')!==player.dataset.blurredSrc){
   player.pause();player.src=player.dataset.blurredSrc;player.load();delete player.dataset.fullVideo;
  }
 };
 document.querySelectorAll('[data-standard-download]').forEach(n=>n.remove());
 if(!standardPlan){
  restorePreview();
  document.querySelectorAll('[data-standard-cta]').forEach(n=>n.remove());
  for(const offer of document.querySelectorAll('.rp-plan-offer:not(.rp-offer-free)')){
   const name=offer.querySelector('.rp-plan-name');
   if(name&&!name.querySelector('span'))name.append(' ',el('span','COMING SOON'));
   if(!offer.querySelector('a,.rp-plan-pending'))offer.append(el('span','Subscription checkout is not open yet.','rp-plan-pending'));
  }
  return;
 }
 const proSlugs=new Set(standardPlan.proSlugs||[]);
 const listedSlugs=new Set(standardPlan.slugs);
 for(const card of document.querySelectorAll('[data-standard-pack-card],.coming-grid.individual-grid article')){
  if(card.querySelector('.rp-routine-tier'))continue;
  const detail=card.querySelector('a.routine-detail-link[href],a[href^="/routines/"]');
  const slug=card.dataset.standardPackCard || (detail && /^\/routines\/([a-z0-9-]+)\/$/.exec(new URL(detail.href).pathname)?.[1]);
  if(!listedSlugs.has(slug))continue;
  const tier=proSlugs.has(slug)?'pro':'standard';
  card.classList.add('rp-tiered-routine');
  const badge=el('span',tier==='pro'?'Ultra':'Pro','rp-routine-tier rp-routine-tier-'+tier);
  card.prepend(badge);
 }
 for(const offer of document.querySelectorAll('.rp-plan-offer:not(.rp-offer-free)')){
  const tier=offer.dataset.planTier||'standard';
  if(offer.hidden)continue;
  const plan=standardPlan.plans?.[tier];
  if(!plan){const pending=offer.querySelector('.rp-plan-pending');if(pending)pending.textContent='This plan is not available yet.';continue;}
  offer.querySelector('.rp-plan-name span')?.remove();
  const benefit=offer.querySelector('.rp-plan-features li:last-child');
  if(benefit)benefit.textContent='MP3 downloads with an active subscription';
  offer.querySelector('.rp-plan-pending')?.remove();
  offer.querySelector('[data-standard-cta]')?.remove();
  const panel=el('div',undefined,'rp-standard-cta');
  panel.dataset.standardCta='';
  if(!user){
   panel.append(button('Create your '+(tier==='pro'?'Ultra':'Pro')+' account',()=>openAuth('register'),'store-button primary'));
   offer.append(panel);continue;
  }
  if(standardPlan.pilot)panel.append(el('p','Admin pilot. Monobank will charge the displayed amount if you confirm payment.'));
  if(standardAccess?.active){
   panel.append(el('p',standardAccess.cancelled?'You can switch to Ultra after your current paid period ends.':'You can switch to Ultra after your current paid period ends. Turn off Pro auto-renewal in your account to make the switch.'),button('Manage Pro',()=>{renderAccount();show(account);}));
  }
  else {
   const consent=el('input');consent.type='checkbox';
   const label=el('label');label.append(consent,document.createTextNode(' I agree to $'+(plan.priceCents/100)+'/month, automatic renewal, and the '));
   const terms=el('a','subscription terms');terms.href='/standard-terms.html';terms.target='_blank';terms.rel='noopener';label.append(terms,'.');
   const feedback=el('p','');feedback.setAttribute('role','status');
   const start=button('Choose '+(tier==='pro'?'Ultra':'Pro'),async()=>{
    if(!user||user.admin){renderHeader();return;}
    if(!consent.checked){feedback.textContent='Confirm the monthly payment before continuing.';return;}
    start.disabled=true;
    try{
     const result=await api('/standard/checkout','POST',{consent:true,tier});
     const url=new URL(result.checkoutUrl);
     if(url.protocol!=='https:'||!['pay.mbnk.biz','pay.monobank.ua','pay.monobank.com.ua'].includes(url.hostname)||url.username||url.password)throw Error('Unexpected checkout link.');
     window.top.location.assign(url.href);
    }catch(e){feedback.textContent=e.message;start.disabled=false;}
   },'store-button primary');
   panel.append(label,start,feedback);
  }
  offer.append(panel);
 }
 const adminAudit=user?.canAuditRoutineDownloads===true;
 if(!user){
  restorePreview();
  const host=document.querySelector('[data-routine-actions]');
  if(host){
   const wrap=el('span',undefined,'rp-standard-download');wrap.dataset.standardDownload='';
   wrap.append(button('Sign up to download',()=>openAuth('register'),'store-button primary'));
   host.append(wrap);
  }
  return;
 }
 const paidActive=standardAccess?.active&&+new Date(standardAccess.paidUntil)>Date.now();
 const freeSlugs=new Set(standardPlan.freeSlugs||[]);
 const available=new Set(standardPlan.slugs.filter(slug=>freeSlugs.has(slug)||adminAudit||(paidActive&&(standardAccess.tier!=='standard'||!proSlugs.has(slug)))));
 function appendDownload(host,slug){
  if(!host||!available.has(slug))return;
  const wrap=el('span',undefined,'rp-standard-download');wrap.dataset.standardDownload='';
  const message=el('span','');message.setAttribute('role','status');
  const download=button('Download',async()=>{
   download.disabled=true;message.textContent='';
   try{
    const result=await api('/standard/routines/'+encodeURIComponent(slug)+'/ticket','POST',{});
    const u=new URL(result.url,API);
    if(u.origin!==API||!/^\/api\/v2\/standard\/download\/[\w-]{43}$/.test(u.pathname))throw Error('Unexpected download link.');
    const a=el('a');a.href=u.href;a.referrerPolicy='no-referrer';document.body.append(a);a.click();a.remove();
   }catch(e){message.textContent=e.message;}finally{download.disabled=false;}
  },'store-button primary');
  wrap.append(download,message);host.append(wrap);
 }
 const slug=document.querySelector('main[data-routine-slug]')?.dataset.routineSlug||/^\/routines\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
 if(slug)appendDownload(document.querySelector('[data-routine-actions]'),slug);
 if(player&&slug&&available.has(slug)&&/^routine-0[1-6]$/.test(slug)){
  if(!player.dataset.blurredSrc)player.dataset.blurredSrc=player.getAttribute('src');
  if(!player.dataset.fullVideo){
   api('/standard/routines/'+encodeURIComponent(slug)+'/video-ticket','POST',{}).then(result=>{
    if(playbackEpoch!==videoGeneration||!player.isConnected)return;
    const url=new URL(result.url,API);
    if(url.origin!==API||!/^\/api\/v2\/standard\/video\/[\w-]{43}$/.test(url.pathname))return;
    const playing=!player.paused;
    player.dataset.fullVideo='true';
    player.src=url.href;
    if(playing)player.play().catch(()=>{});
   }).catch(()=>{});
  }
 }else restorePreview();
}
function socialLogin(provider){const popup=window.open(API+'/api/v2/auth/oauth/'+provider+'?origin='+encodeURIComponent(location.origin),'mukvik-signin','popup,width=520,height=650');if(!popup){error.textContent=T('Allow pop-ups to continue.');return;}const receive=async event=>{if(event.origin!==API||event.source!==popup||event.data?.type!=='mukvik-auth')return;window.removeEventListener('message',receive);if(event.data.error){error.textContent=T('Social sign-in failed. Please try email.');return;}try{await finishLogin(event.data.accessToken);await afterLogin();}catch(e){error.textContent=e.message;}};window.addEventListener('message',receive);}
document.querySelectorAll('[data-auth-open]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();openAuth(b.dataset.authOpen);}));
document.addEventListener('languagechange',()=>{renderHeader();renderAuth();renderAccount();});
renderHeader();renderAuth();
async function loadCatalog(){const data=await api('/catalog');publicStandardPlan=standardPlan=data.standard;}
try{
 await Promise.all([loadCatalog(),token?api('/me').then(value=>{user=value;}).catch(()=>{}):null]);
 await refreshStandard(accountQuery.get('subscription')==='return');renderHeader();
}catch(e){accountStatus.textContent=e.message;renderHeader();}
if(accountRequested)await openRequestedAccount();
if(accountQuery.get('subscription')==='return'&&user&&standardPlan&&!standardAccess?.active){
 let attempts=0;
 const poll=setInterval(async()=>{
  if(++attempts>=6||!user)clearInterval(poll);
  await refreshStandard(true);
  if(standardAccess?.active){clearInterval(poll);renderHeader();}
 },6000);
}
window.addEventListener('pageshow',event=>{if(event.persisted&&user&&standardPlan)refreshStandard().then(renderHeader);});
try{providers=await api('/auth/providers');auth.querySelectorAll('[data-provider]').forEach(b=>{b.disabled=!providers[b.dataset.provider];});}catch{}
})();


