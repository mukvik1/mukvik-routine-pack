(async()=>{
'use strict';
await window.RP_I18N.ready;
const API='https://mukvik-routine-pack-production.up.railway.app';
const accountMessages={"ar":{"Please wait…":"يرجى الانتظار…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"ادفع بأمان بالهريفنيا. يظهر سعر الصرف والمبلغ النهائي قبل الدفع.","Pay":"ادفع","Order saved. You can pay from your account.":"تم حفظ الطلب. يمكنك الدفع من حسابك."},"hi":{"Please wait…":"कृपया प्रतीक्षा करें…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"UAH में सुरक्षित भुगतान करें। अंतिम विनिमय दर और राशि भुगतान से पहले दिखाई जाती हैं।","Pay":"भुगतान करें","Order saved. You can pay from your account.":"ऑर्डर सहेज लिया गया। आप अपने अकाउंट से भुगतान कर सकते हैं।"},"it":{"Please wait…":"Attendi…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"Paga in sicurezza in UAH. Il cambio e l'importo finale sono indicati prima del pagamento.","Pay":"Paga","Order saved. You can pay from your account.":"Ordine salvato. Puoi pagare dal tuo account."},"pt-BR":{"Please wait…":"Aguarde…","Pay securely in UAH. The final exchange rate and amount are shown before payment.":"Pague com segurança em UAH. A taxa de câmbio e o valor final são exibidos antes do pagamento.","Pay":"Pagar","Order saved. You can pay from your account.":"Pedido salvo. Você pode pagar pela sua conta."}};
const removeLabels={en:'Remove unpaid order',uk:'Видалити неоплачене замовлення',de:'Unbezahlte Bestellung entfernen',es:'Eliminar pedido sin pagar',th:'ลบคำสั่งซื้อที่ยังไม่ได้ชำระเงิน',id:'Hapus pesanan belum dibayar',ar:'إزالة الطلب غير المدفوع',hi:'अवैतनिक ऑर्डर हटाएँ',it:'Rimuovi ordine non pagato','pt-BR':'Remover pedido não pago'};
for(const [language,label] of Object.entries(removeLabels)){accountMessages[language]??={};accountMessages[language]['Remove unpaid order']=label;}
const currencyKey='Prices are in USD. Payment is processed in UAH, the store currency (Ukraine). Your bank converts this amount to your card currency at its own rate; fees may apply.';
accountMessages.uk??={};accountMessages.uk[currencyKey]='Ціни вказані в USD. Оплата здійснюється у гривні — валюті магазину (Україна). Ваш банк конвертує цю суму у валюту картки за власним курсом; можливі комісії.';
const T=k=>accountMessages[window.RP_I18N.language]?.[k]||window.RP_I18N.t(k),money=n=>new Intl.NumberFormat(window.RP_I18N.language,{style:'currency',currency:'USD'}).format(n/100);
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}},write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}};
let token=read('mukvik_store_session'),user=null,catalog=[],cart=[],pendingCheckout=false,challenge=null,mode='login',providers={};
let orderKey=null,cartBusy=false,pendingFree=null,usdUahRate=46;
try{cart=JSON.parse(read('mukvik_guest_cart')||'[]');if(!Array.isArray(cart))cart=[];}catch{}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls='store-button')=>{const b=el('button',T(label),cls);b.type='button';b.addEventListener('click',fn);return b;};
function dialog(id,title){const d=el('dialog',undefined,'store-dialog');d.id=id;const head=el('div',undefined,'store-dialog-head'),h=el('h2',T(title));h.dataset.title=title;const close=button('Close',()=>d.close(),'store-close');close.textContent='×';close.setAttribute('aria-label',T('Close'));head.append(h,close);d.append(head);d.setAttribute('aria-labelledby',id+'-title');h.id=id+'-title';d.addEventListener('click',e=>{if(e.target===d)d.close();});document.body.append(d);return d;}
const auth=dialog('store-auth','SIGN IN'),cartDialog=dialog('store-cart','Your cart'),account=dialog('store-cabinet','Your account');
const error=el('p','','store-error');error.setAttribute('role','alert');
const authTabs=el('div',undefined,'store-tabs');authTabs.append(button('SIGN IN',()=>{mode='login';challenge=null;renderAuth();}),button('SIGN UP',()=>{mode='register';challenge=null;renderAuth();}));
const authBody=el('div');auth.append(authTabs,authBody,error);
function show(d){for(const other of [auth,cartDialog,account])if(other!==d&&other.open)other.close();if(!d.open)d.showModal();}
async function api(path,method='GET',data){const r=await fetch(API+'/api/v2'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});let body;try{body=await r.json();}catch{throw Error(T('Service temporarily unavailable.'));}if(!r.ok){if(r.status===401){token=null;user=null;write('mukvik_store_session',null);renderHeader();}throw Error(T(body.error||'Service temporarily unavailable.')+(body.paymentCode?' ['+body.paymentCode+']':''));}return body;}
const status=el('p','','store-error');status.setAttribute('role','status');cartDialog.append(status);
function renderAuth(){
 error.textContent='';authBody.replaceChildren();
 const registration=mode==='register',reset=mode==='reset';
 auth.querySelector('h2').textContent=T(challenge?'Confirm your email':reset?'RESET PASSWORD':registration?'SIGN UP':'SIGN IN');
 authTabs.hidden=Boolean(challenge)||reset;
 authTabs.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String((i===1)===registration)));
 if(challenge){
  const form=el('form'),label=el('label',T('Confirmation code')),input=el('input');
  input.required=true;input.pattern='[0-9]{8}';input.maxLength=8;input.inputMode='numeric';label.append(input);form.append(el('p',T('Enter the code sent to your email.')+' '+challenge.email,'store-muted'),label);
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
  authBody.append(form);return;
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
 auth.close();
 if(pendingFree){const slug=pendingFree;pendingFree=null;pendingCheckout=false;await downloadFree(slug);return;}
 show(pendingCheckout?cartDialog:account);pendingCheckout=false;
}
async function downloadFree(slug){
 if(!user){pendingFree=slug;openAuth('register');return;}
 freeStatus.textContent=T('Please wait…');
 try{
  const response=await fetch(API+'/api/v2/free/'+encodeURIComponent(slug)+'/download',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(response.status===401){token=null;user=null;write('mukvik_store_session',null);renderHeader();pendingFree=slug;openAuth('login');freeStatus.textContent='';return;}
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
function renderPackOffer(){
 const eligible=user?.welcomePackEligible===true;
 document.querySelectorAll('[data-pack-current-price]').forEach(n=>n.textContent=money(eligible?3920:4900));
 document.querySelectorAll('[data-pack-list-price]').forEach(n=>{n.hidden=!eligible;n.textContent=money(4900);});
 document.querySelectorAll('[data-pack-welcome-offer]').forEach(n=>n.hidden=false);
 document.querySelectorAll('[data-pack-discount-applied]').forEach(n=>n.hidden=!eligible);
 document.querySelectorAll('[data-pack-price-label]').forEach(n=>n.textContent=T(eligible?'Welcome price':'Regular price'));
}
function renderHeader(){
 renderPackOffer();
 document.querySelectorAll('[data-store-auth]').forEach(box=>{
  box.replaceChildren();
  if(!user){box.append(button('SIGN IN',()=>openAuth()),button('SIGN UP',()=>openAuth('register'),'store-button primary'));}
  else{const menu=el('details',undefined,'store-user-menu'),summary=el('summary',user.nickname||user.email);summary.title=user.email;const entries=el('div',undefined,'store-user-entries');entries.append(button('Your account',()=>{menu.open=false;renderAccount();show(account);}),button('Your cart',()=>{menu.open=false;renderCart();show(cartDialog);}),button('Sign out',async()=>{try{await api('/auth/logout','POST',{});token=null;user=null;cart=[];write('mukvik_store_session',null);renderHeader();renderCart();account.close();}catch(e){accountStatus.textContent=e.message;renderAccount();show(account);}}));menu.append(summary,entries);box.append(menu);}
 });
 document.querySelectorAll('[data-cart-count]').forEach(n=>n.textContent=String(cart.length));
}
async function saveCart(next){
 if(cartBusy)return false;cartBusy=true;status.textContent='';
 try{if(user)await api('/cart','PUT',{productCodes:next});cart=next;orderKey=null;if(!user)write('mukvik_guest_cart',JSON.stringify(cart));renderHeader();renderCart();return true;}catch(e){status.textContent=e.message;return false;}finally{cartBusy=false;}
}
async function finishLogin(access){token=access;write('mukvik_store_session',token);user=await api('/me');const remote=await api('/cart');const merged=[...new Set([...remote.items.map(x=>x.code),...cart])].filter(code=>catalog.some(p=>p.code===code));await api('/cart','PUT',{productCodes:merged});cart=merged;write('mukvik_guest_cart',null);renderHeader();renderCart();}
const cartBody=el('div');cartDialog.append(cartBody);
function currencyNote(cents){
 const note=el('p',undefined,'store-muted');note.style.fontSize='12px';note.style.lineHeight='1.5';
 const uah=new Intl.NumberFormat(window.RP_I18N.language,{style:'currency',currency:'UAH'}).format(Math.round(cents*usdUahRate)/100);
 note.textContent=money(cents)+' USD → '+uah+'. '+T('Prices are in USD. Payment is processed in UAH, the store currency (Ukraine). Your bank converts this amount to your card currency at its own rate; fees may apply.');return note;
}
function paymentConsent(){
 const label=el('label',undefined,'store-consent'),input=el('input');input.type='checkbox';input.required=true;
 label.append(input,document.createTextNode(' '+T('I request immediate digital delivery after payment and have read the ') ));
 for(const [title,path] of [['Terms','/legal/terms/'],['Refund policy','/legal/refunds/'],['Privacy policy','/legal/privacy/']]){const link=el('a',T(title));link.href=path;link.target='_blank';link.rel='noopener noreferrer';label.append(link,document.createTextNode('. '));}
 return {label,input};
}
async function showMonobankInvoice(orderId){
 status.textContent='';cartBody.replaceChildren();
 cartBody.append(el('p',T('Your order')+' '+orderId.slice(0,8),'store-muted'));
 const order=user?.orders.find(order=>order.id===orderId);
 if(order){for(const item of order.items)cartBody.append(el('p',item.name));const total=el('div',undefined,'store-total');total.append(el('span',T('Total')),el('strong',money(order.totalCents)));cartBody.append(total);}
 if(order)cartBody.append(currencyNote(order.totalCents));
 const consent=paymentConsent();cartBody.append(consent.label);
 const pay=button('PAY WITH MONOBANK',async()=>{if(!consent.input.checked){status.textContent=T('Please confirm digital delivery before payment.');return;}pay.disabled=true;status.textContent='';try{await requestMonobankInvoice(orderId);}catch(e){status.textContent=e.message;pay.disabled=false;}},'store-button primary');
 cartBody.append(pay);show(cartDialog);
}
async function requestMonobankInvoice(orderId){
 const quote=await api('/orders/'+orderId+'/monobank','POST',{acceptDigitalDelivery:true});
 const destination=new URL(quote.pageUrl);
 if(destination.protocol!=='https:'||destination.username||destination.password||destination.port||!['pay.mbnk.biz','pay.monobank.ua','pay.monobank.com.ua'].includes(destination.hostname))throw Error(T('Service temporarily unavailable.'));
 window.top.location.assign(destination.href);
}
function productPrice(p){return p.code==='pack'&&user?.welcomePackEligible?3920:p.priceCents;}
function renderCart(){cartDialog.querySelector('h2').textContent=T('Your cart');cartBody.replaceChildren();
 if(!cart.length){cartBody.append(el('p',T('Your cart is empty.'),'store-muted'));return;}
 let total=0;
 for(const code of cart){const p=catalog.find(p=>p.code===code);if(!p)continue;const price=productPrice(p);total+=price;const row=el('div',undefined,'store-cart-row'),copy=el('div');copy.append(el('strong',p.name),el('p',money(price),'store-muted'));row.append(copy,button('Remove',()=>saveCart(cart.filter(x=>x!==code)),'store-text-button'));cartBody.append(row);}
 if(cart.includes('pack')){if(user?.welcomePackEligible)cartBody.append(el('p',T('Welcome discount applied')+' · −20%','store-welcome-note'));else cartBody.append(el('p',T('New accounts get 20% off their first full pack.')+' '+T('Welcome price')+': '+money(3920),'store-welcome-note'));}
 const totalEl=el('div',undefined,'store-total');totalEl.append(el('span',T('Total')),el('strong',money(total)));cartBody.append(totalEl);cartBody.append(currencyNote(total));
 const consent=user?paymentConsent():null;if(consent)cartBody.append(consent.label);
 const checkout=button(user?'PAY WITH MONOBANK':'SIGN IN TO CHECK OUT',async()=>{if(!user){pendingCheckout=true;openAuth(cart.includes('pack')?'register':'login');return;}if(!consent.input.checked){status.textContent=T('Please confirm digital delivery before payment.');return;}checkout.disabled=true;status.textContent='';try{orderKey=orderKey||crypto.randomUUID();const created=await api('/orders','POST',{idempotencyKey:orderKey});cart=[];orderKey=null;user=await api('/me');renderHeader();renderAccount();await requestMonobankInvoice(created.order.id);}catch(e){status.textContent=e.message;renderAccount();show(account);accountStatus.textContent=e.message;}finally{checkout.disabled=false;}},'store-button primary');cartBody.append(checkout);
}
const accountBody=el('div'),accountStatus=el('p','','store-error');accountStatus.setAttribute('role','status');account.append(accountStatus,accountBody);
function renderAccount(){account.querySelector('h2').textContent=T('Your account');accountBody.replaceChildren();if(!user)return;accountBody.append(el('p',user.email,'store-muted'),el('h3',T('Your orders')));
 if(!user.orders.length)accountBody.append(el('p',T('No orders yet.'),'store-muted'));
 for(const order of user.orders){const block=el('section',undefined,'store-order');block.append(el('strong',T('Order')+' '+order.id.slice(0,8)),el('p',T(order.status==='approved'?'Approved':order.status==='awaiting_manual_review'?'Awaiting payment confirmation':order.status==='cancelled'?'Cancelled':'Refunded'),'store-muted'));
  for(const item of order.items){block.append(el('p',item.name));for(const file of item.files||[]){const b=button('Download',async()=>{b.disabled=true;try{const r=await api('/orders/'+order.id+'/files/'+item.code+'/'+file.index+'/ticket','POST',{});const u=new URL(r.url,API);if(u.origin!==API)throw Error(T('Service temporarily unavailable.'));const a=el('a');a.href=u.href;a.download='';document.body.append(a);a.click();a.remove();}catch(e){accountStatus.textContent=e.message;}finally{b.disabled=false;}});b.textContent=T('Download')+' · '+file.name;block.append(b);}}
  block.append(el('strong',money(order.totalCents)));
  if(order.status==='awaiting_manual_review'){
   const pay=button('PAY WITH MONOBANK',()=>showMonobankInvoice(order.id));
   block.append(pay);
  }
  if(order.status==='awaiting_manual_review'||order.status==='cancelled'){
   const remove=button('Remove unpaid order',async()=>{remove.disabled=true;accountStatus.textContent='';try{await api('/orders/'+order.id+'/hide','POST',{});user=await api('/me');renderAccount();}catch(e){accountStatus.textContent=e.message;remove.disabled=false;}});
   block.append(remove);
  }accountBody.append(block);
 }
 accountBody.append(button('Refresh',async()=>{try{for(const o of user.orders.filter(x=>x.status==='awaiting_manual_review'))await api('/orders/'+o.id+'/monobank/status');user=await api('/me');renderAccount();}catch(e){accountStatus.textContent=e.message;}}));
}
function socialLogin(provider){const popup=window.open(API+'/api/v2/auth/oauth/'+provider+'?origin='+encodeURIComponent(location.origin),'mukvik-signin','popup,width=520,height=650');if(!popup){error.textContent=T('Allow pop-ups to continue.');return;}const receive=async event=>{if(event.origin!==API||event.source!==popup||event.data?.type!=='mukvik-auth')return;window.removeEventListener('message',receive);if(event.data.error){error.textContent=T('Social sign-in failed. Please try email.');return;}try{await finishLogin(event.data.accessToken);await afterLogin();}catch(e){error.textContent=e.message;}};window.addEventListener('message',receive);}
document.querySelectorAll('[data-auth-open]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();openAuth(b.dataset.authOpen);}));
document.querySelectorAll('[data-cart]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();status.textContent='';renderCart();show(cartDialog);}));
document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',async e=>{e.preventDefault();const code=b.dataset.productId;if(!catalog.some(p=>p.code===code)){status.textContent=T('Service temporarily unavailable.');show(cartDialog);return;}b.setAttribute('aria-busy','true');await saveCart([...new Set([...cart,code])]);b.removeAttribute('aria-busy');show(cartDialog);}));
document.addEventListener('languagechange',()=>{renderHeader();renderAuth();renderCart();renderAccount();});
renderHeader();renderAuth();renderCart();
try{const data=await api('/catalog');catalog=data.products;usdUahRate=Number(data.usdUahRate)||46;cart=cart.filter(c=>catalog.some(p=>p.code===c));if(token){try{user=await api('/me');cart=(await api('/cart')).items.map(x=>x.code);}catch{user=null;}}renderHeader();renderCart();}catch(e){status.textContent=e.message;}
try{providers=await api('/auth/providers');auth.querySelectorAll('[data-provider]').forEach(b=>{b.disabled=!providers[b.dataset.provider];});}catch{}
})();


