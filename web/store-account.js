(async()=>{
'use strict';
await window.RP_I18N.ready;
const API='https://mukvik-routine-pack-production.up.railway.app';
const T=k=>window.RP_I18N.t(k),money=n=>new Intl.NumberFormat(window.RP_I18N.language==='uk'?'uk-UA':'en-US',{style:'currency',currency:'USD'}).format(n/100);
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}},write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}};
let token=read('mukvik_store_session'),user=null,catalog=[],cart=[],pendingCheckout=false,challenge=null,mode='login',providers={};
let orderKey=null,cartBusy=false;
try{cart=JSON.parse(read('mukvik_guest_cart')||'[]');if(!Array.isArray(cart))cart=[];}catch{}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(label,fn,cls='store-button')=>{const b=el('button',T(label),cls);b.type='button';b.addEventListener('click',fn);return b;};
function dialog(id,title){const d=el('dialog',undefined,'store-dialog');d.id=id;const head=el('div',undefined,'store-dialog-head'),h=el('h2',T(title));h.dataset.title=title;const close=button('Close',()=>d.close(),'store-close');close.textContent='×';close.setAttribute('aria-label',T('Close'));head.append(h,close);d.append(head);d.setAttribute('aria-labelledby',id+'-title');h.id=id+'-title';d.addEventListener('click',e=>{if(e.target===d)d.close();});document.body.append(d);return d;}
const auth=dialog('store-auth','SIGN IN'),cartDialog=dialog('store-cart','Your cart'),account=dialog('store-cabinet','Your account');
const error=el('p','','store-error');error.setAttribute('role','alert');
const authTabs=el('div',undefined,'store-tabs');authTabs.append(button('SIGN IN',()=>{mode='login';challenge=null;renderAuth();}),button('SIGN UP',()=>{mode='register';challenge=null;renderAuth();}));
const authBody=el('div');auth.append(authTabs,authBody,error);
function show(d){for(const other of [auth,cartDialog,account])if(other!==d&&other.open)other.close();if(!d.open)d.showModal();}
async function api(path,method='GET',data){const r=await fetch(API+'/api/v2'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});let body;try{body=await r.json();}catch{throw Error(T('Service temporarily unavailable.'));}if(!r.ok){if(r.status===401){token=null;user=null;write('mukvik_store_session',null);renderHeader();}throw Error(T(body.error||'Service temporarily unavailable.'));}return body;}
const status=el('p','','store-error');status.setAttribute('role','status');cartDialog.append(status);
function renderAuth(){
 error.textContent='';authBody.replaceChildren();auth.querySelector('h2').textContent=T(challenge?'Confirm your email':mode==='register'?'SIGN UP':'SIGN IN');
 authTabs.hidden=Boolean(challenge);authTabs.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String((i===1)===(mode==='register'))));
 if(challenge){
  const hint=el('p',T('Enter the code sent to your email.')+' '+challenge.email,'store-muted');
  const form=el('form'),label=el('label',T('Confirmation code')),input=el('input');input.name='code';input.required=true;input.inputMode='numeric';input.autocomplete='one-time-code';input.pattern='[0-9]{8}';input.maxLength=8;input.minLength=8;label.append(input);
  const submit=el('button',T('CONFIRM'),'store-button primary');submit.type='submit';form.append(label,submit);
  form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{const result=await api('/auth/code/verify','POST',{challengeId:challenge.id,code:input.value.trim()});await finishLogin(result.accessToken);auth.close();if(pendingCheckout){pendingCheckout=false;show(cartDialog);}else{show(account);renderAccount();}}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}});
  authBody.append(hint,form,button('Use another email',()=>{challenge=null;renderAuth();},'store-text-button'));return;
 }
 const social=el('div',undefined,'store-social');
 for(const [key,name] of [['google','Google'],['facebook','Facebook'],['apple','Apple']]){
  const b=button('Continue with '+name,()=>socialLogin(key));b.dataset.provider=key;b.disabled=!providers[key];if(b.disabled)b.title=T('Social sign-in is not configured yet.');social.append(b);
 }
 authBody.append(social,el('p',T('or use email'),'store-divider'));
 const form=el('form'),emailLabel=el('label',T('Email')),email=el('input');email.type='email';email.autocomplete='email';email.name='email';email.required=true;emailLabel.append(email);
 let nickname;
 if(mode==='register'){const label=el('label',T('Nickname (optional)'));nickname=el('input');nickname.name='nickname';nickname.autocomplete='nickname';nickname.maxLength=40;label.append(nickname);form.append(label);}
 const submit=el('button',T('SEND CODE'),'store-button primary');submit.type='submit';form.append(emailLabel,submit);
 form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;error.textContent='';try{const result=await api('/auth/code/start','POST',{email:email.value,nickname:nickname?.value||''});challenge={id:result.challengeId,email:email.value};renderAuth();authBody.querySelector('input')?.focus();}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}});
 authBody.append(form,el('p',T('We will email you a one-time code. No password needed.'),'store-muted'));
}
function openAuth(value='login'){mode=value;challenge=null;renderAuth();show(auth);}
function renderHeader(){
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
function renderCart(){cartDialog.querySelector('h2').textContent=T('Your cart');cartBody.replaceChildren();
 if(!cart.length){cartBody.append(el('p',T('Your cart is empty.'),'store-muted'));return;}
 let total=0;
 for(const code of cart){const p=catalog.find(p=>p.code===code);if(!p)continue;total+=p.priceCents;const row=el('div',undefined,'store-cart-row'),copy=el('div');copy.append(el('strong',p.name),el('p',money(p.priceCents),'store-muted'));row.append(copy,button('Remove',()=>saveCart(cart.filter(x=>x!==code)),'store-text-button'));cartBody.append(row);}
 const totalEl=el('div',undefined,'store-total');totalEl.append(el('span',T('Total')),el('strong',money(total)));cartBody.append(totalEl,el('p',T('Payment is confirmed by MUKVIK after you place your order.'),'store-muted'));
 const checkout=button(user?'PLACE ORDER':'SIGN IN TO CHECK OUT',async()=>{if(!user){pendingCheckout=true;openAuth();return;}checkout.disabled=true;try{orderKey=orderKey||crypto.randomUUID();await api('/orders','POST',{idempotencyKey:orderKey});cart=[];orderKey=null;renderHeader();user=await api('/me');renderAccount();show(account);}catch(e){status.textContent=e.message;}finally{checkout.disabled=false;}},'store-button primary');cartBody.append(checkout);
}
const accountBody=el('div'),accountStatus=el('p','','store-error');accountStatus.setAttribute('role','status');account.append(accountStatus,accountBody);
function renderAccount(){account.querySelector('h2').textContent=T('Your account');accountBody.replaceChildren();if(!user)return;accountBody.append(el('p',user.email,'store-muted'),el('h3',T('Your orders')));
 if(!user.orders.length)accountBody.append(el('p',T('No orders yet.'),'store-muted'));
 for(const order of user.orders){const block=el('section',undefined,'store-order');block.append(el('strong',T('Order')+' '+order.id.slice(0,8)),el('p',T(order.status==='approved'?'Approved':order.status==='awaiting_manual_review'?'Awaiting payment confirmation':order.status==='cancelled'?'Cancelled':'Refunded'),'store-muted'));
  for(const item of order.items){block.append(el('p',item.name));for(const file of item.files||[]){const b=button('Download',async()=>{b.disabled=true;try{const r=await api('/orders/'+order.id+'/files/'+item.code+'/'+file.index+'/ticket','POST',{});const u=new URL(r.url,API);if(u.origin!==API)throw Error(T('Service temporarily unavailable.'));const a=el('a');a.href=u.href;a.download='';document.body.append(a);a.click();a.remove();}catch(e){accountStatus.textContent=e.message;}finally{b.disabled=false;}});b.textContent=T('Download')+' · '+file.name;block.append(b);}}
  block.append(el('strong',money(order.totalCents)));
  if(order.status==='awaiting_manual_review'){const a=el('a',T('CONTACT MUKVIK'),'store-button');a.href='https://www.instagram.com/mukvik.ofc/';a.target='_blank';a.rel='noopener noreferrer';block.append(a,el('p',T('Send your order number to MUKVIK to arrange payment.'),'store-muted'));}accountBody.append(block);
 }
 accountBody.append(button('Refresh',async()=>{try{user=await api('/me');renderAccount();}catch(e){accountStatus.textContent=e.message;}}));
}
function socialLogin(provider){const popup=window.open(API+'/api/v2/auth/oauth/'+provider+'?origin='+encodeURIComponent(location.origin),'mukvik-signin','popup,width=520,height=650');if(!popup){error.textContent=T('Allow pop-ups to continue.');return;}const receive=async event=>{if(event.origin!==API||event.source!==popup||event.data?.type!=='mukvik-auth')return;window.removeEventListener('message',receive);if(event.data.error){error.textContent=T('Social sign-in failed. Please try email.');return;}try{await finishLogin(event.data.accessToken);auth.close();renderAccount();show(pendingCheckout?cartDialog:account);pendingCheckout=false;}catch(e){error.textContent=e.message;}};window.addEventListener('message',receive);}
document.querySelectorAll('[data-auth-open]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();openAuth(b.dataset.authOpen);}));
document.querySelectorAll('[data-cart]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();status.textContent='';renderCart();show(cartDialog);}));
document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',async e=>{e.preventDefault();const code=b.dataset.productId;if(!catalog.some(p=>p.code===code)){status.textContent=T('Service temporarily unavailable.');show(cartDialog);return;}b.setAttribute('aria-busy','true');await saveCart([...new Set([...cart,code])]);b.removeAttribute('aria-busy');show(cartDialog);}));
document.addEventListener('languagechange',()=>{renderHeader();renderAuth();renderCart();renderAccount();});
renderHeader();renderAuth();renderCart();
try{const data=await api('/catalog');catalog=data.products;cart=cart.filter(c=>catalog.some(p=>p.code===c));if(token){try{user=await api('/me');cart=(await api('/cart')).items.map(x=>x.code);}catch{user=null;}}renderHeader();renderCart();}catch(e){status.textContent=e.message;}
try{providers=await api('/auth/providers');auth.querySelectorAll('[data-provider]').forEach(b=>{b.disabled=!providers[b.dataset.provider];});}catch{}
})();
