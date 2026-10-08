(function accountFrontend(){
'use strict';
const contact='https://www.instagram.com/mukvik.ofc/';
const copy={
 en:{eyebrow:'YOUR LIBRARY',title:'Account & downloads',intro:'Build your cart, check your orders and access approved purchases.',signinHeading:'Sign in',signinHelp:'Sign in with your email and password.',email:'Email',password:'Password',register:'Create an account on the main site',recover:'Forgot password? Recover it on the main site.',signin:'Sign in',profile:'Your account',logout:'Sign out',shop:'SHOP',catalog:'Routines and packs',viewSite:'View the site',cart:'Your cart',order:'Create order',cartNote:"We'll confirm your purchase after you contact MUKVIK.",orders:'Your orders',owner:'OWNER',admin:'Orders awaiting approval',adminNote:'Verify payment yourself before approving an order.',footer:'Routine Pack · Digital downloads',add:'Add',remove:'Remove',total:'Total',empty:'Your cart is empty.',noOrders:'No orders yet.',signinFirst:'Sign in to add products to your cart.',sent:'Check your email for a one-time sign-in link.',signed:'You are signed in.',sessionExpired:'Sign in again to continue.',genericError:'Something went wrong. Please try again.',waiting:'Awaiting your payment and seller approval',approved:'Approved',cancelled:'Cancelled',refunded:'Refunded',files:'Your downloads',download:'Download',contact:'Contact MUKVIK to pay ↗',orderCreated:'Order created. Tell MUKVIK your order number when paying.',orderNumber:'Order',approve:'Approve',approvedNow:'Order approved. The buyer can now access the purchased files.',noPending:'No pending orders.',check:'I have confirmed that this order was paid. Grant access now?',invalid:'Sign-in link expired. Request a new one.',emailRequired:'Enter a valid email address.',date:'en-US'},
 uk:{eyebrow:'ВАША БІБЛІОТЕКА',title:'Кабінет і завантаження',intro:'Збирайте кошик, переглядайте замовлення й отримуйте підтверджені покупки.',signinHeading:'Увійти',signinHelp:'Увійдіть за допомогою email і пароля.',email:'Електронна пошта',password:'Пароль',register:'Створити акаунт на головному сайті',recover:'Забули пароль? Відновіть його на головному сайті.',signin:'Увійти',profile:'Ваш кабінет',logout:'Вийти',shop:'КАТАЛОГ',catalog:'Рутини та паки',viewSite:'Перейти на сайт',cart:'Ваш кошик',order:'Створити замовлення',cartNote:'Покупка буде підтверджена після звернення до MUKVIK.',orders:'Ваші замовлення',owner:'ВЛАСНИК',admin:'Замовлення на підтвердження',adminNote:'Перш ніж підтвердити замовлення, перевірте оплату.',footer:'Routine Pack · Цифрові файли',add:'Додати',remove:'Прибрати',total:'Разом',empty:'Кошик порожній.',noOrders:'Замовлень поки немає.',signinFirst:'Увійдіть, щоб додавати товари в кошик.',sent:'Перевірте пошту: ми надіслали одноразове посилання для входу.',signed:'Ви увійшли.',sessionExpired:'Увійдіть знову, щоб продовжити.',genericError:'Сталася помилка. Спробуйте ще раз.',waiting:'Очікує на вашу оплату й підтвердження продавця',approved:'Підтверджено',cancelled:'Скасовано',refunded:'Повернено',files:'Ваші файли',download:'Завантажити',contact:'Написати MUKVIK для оплати ↗',orderCreated:'Замовлення створено. Повідомте MUKVIK його номер під час оплати.',orderNumber:'Замовлення',approve:'Підтвердити',approvedNow:'Замовлення підтверджено. Покупець має доступ до придбаних файлів.',noPending:'Немає замовлень на підтвердження.',check:'Я перевірив оплату цього замовлення. Надати доступ?',invalid:'Термін посилання минув. Запросіть нове.',emailRequired:'Введіть дійсну електронну адресу.',date:'uk-UA'}
};
const el=id=>document.getElementById(id);
const sessionKey='routine_pack_access';
let lang=localStorage.getItem('routine_pack_language')==='uk'?'uk':'en';
let access=sessionStorage.getItem(sessionKey)||'';
let products=[],cart=[],account=null,adminOrders=[];
const tr=key=>copy[lang][key]||key;
function node(tag,text,cls){const result=document.createElement(tag);if(text!==undefined)result.textContent=String(text);if(cls)result.className=cls;return result;}
function money(cents){return new Intl.NumberFormat(copy[lang].date,{style:'currency',currency:'USD'}).format(cents/100);}
function message(value,error=false){const box=el('message');box.hidden=!value;box.classList.toggle('error',error);box.textContent=value||'';}
async function request(path,method='GET',payload){
 const result=await fetch('/api/v2'+path,{method,headers:{...(access?{Authorization:'Bearer '+access}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store'});
 const data=await result.json().catch(()=>({}));
 if(!result.ok){
  if(result.status===401){access='';sessionStorage.removeItem(sessionKey);account=null;cart=[];}
  const error=new Error(data.error||tr('genericError'));error.status=result.status;throw error;
 }
 return data;
}
function readable(error){if(error?.status===410)return tr('invalid');if(error?.status===401)return tr('sessionExpired');return lang==='uk'?tr('genericError'):(error?.message||tr('genericError'));}
function repaintText(){
 document.documentElement.lang=lang;document.title=(lang==='uk'?'Кабінет':'Account')+' · Routine Pack';
 const ids={eyebrow:'eyebrow',title:'title',intro:'intro','signin-heading':'signinHeading','signin-help':'signinHelp','email-label':'email','password-label':'password','register-link':'register','recover-link':'recover','signin-button':'signin','profile-heading':'profile',logout:'logout','catalog-kicker':'shop','catalog-heading':'catalog','site-link':'viewSite','cart-heading':'cart','order-button':'order','cart-note':'cartNote','orders-heading':'orders','admin-kicker':'owner','admin-heading':'admin','admin-note':'adminNote','footer-text':'footer'};
 for(const [id,key] of Object.entries(ids))el(id).textContent=tr(key);
 for(const code of ['en','uk']){el('lang-'+code).classList.toggle('active',lang===code);el('lang-'+code).setAttribute('aria-pressed',String(lang===code));}
 render();
}
function render(){
 el('auth-card').hidden=Boolean(access&&account);
 el('profile-card').hidden=!(access&&account);
 el('cart-card').hidden=!(access&&account);
 el('orders-card').hidden=!(access&&account);
 el('admin-card').hidden=!(account?.admin);
 if(account)el('profile-email').textContent=account.email;
 const list=el('products');list.replaceChildren();
 for(const product of products){
  const row=node('div',undefined,'product'),info=node('div');
  info.append(node('strong',product.name),node('small',money(product.priceCents)));
  const selected=cart.includes(product.code),button=node('button',tr(selected?'remove':'add'),'product-button');
  button.type='button';button.dataset.product=product.code;button.disabled=!access;
  row.append(info,button);list.append(row);
 }
 const total=cart.reduce((sum,code)=>sum+(products.find(p=>p.code===code)?.priceCents||0),0);
 el('cart-total').textContent=cart.length?tr('total')+': '+money(total):tr('empty');
 el('order-button').disabled=!cart.length;
 const orders=el('orders');orders.replaceChildren();
 if(account){
  if(!account.orders.length)orders.append(node('p',tr('noOrders')));
  for(const order of account.orders){
   const panel=node('div',undefined,'purchase'),heading=node('strong',tr('orderNumber')+' #'+order.id);
   panel.append(heading,node('small',new Date(order.createdAt).toLocaleString(copy[lang].date)+' · '+money(order.totalCents)+' · '+(tr(order.status==='awaiting_manual_review'?'waiting':order.status))));
   for(const item of order.items){
    panel.append(node('p',item.name));
    if(item.accessible&&item.files.length){
     const wrap=node('div',undefined,'files');
     for(const file of item.files){const btn=node('button',tr('download')+' · '+file.name);btn.type='button';btn.dataset.order=order.id;btn.dataset.code=item.code;btn.dataset.index=String(file.index);wrap.append(btn);}
     panel.append(wrap);
    }
   }
   if(order.status==='awaiting_manual_review'){const link=node('a',tr('contact'),'subtle');link.href=contact;link.target='_blank';link.rel='noopener noreferrer';panel.append(link);}
   orders.append(panel);
  }
 }
 const admin=el('admin-orders');admin.replaceChildren();
 const waiting=adminOrders.filter(x=>x.status==='awaiting_manual_review');
 if(account?.admin&&!waiting.length)admin.append(node('p',tr('noPending')));
 for(const order of waiting){
  const panel=node('div',undefined,'admin-order');
  panel.append(node('strong',order.email),node('small',order.id+' · '+money(order.total_cents)));
  for(const item of order.items||[])panel.append(node('p',item.name+' · '+money(item.priceCents)));
  const button=node('button',tr('approve'));button.type='button';button.dataset.approve=order.id;panel.append(button);admin.append(panel);
 }
}
async function loadAccount(){
 if(!access){account=null;cart=[];adminOrders=[];render();return;}
 const result=await request('/me');
 account=result;const basket=await request('/cart');cart=basket.items.map(x=>x.code);
 adminOrders=account.admin?(await request('/admin/orders')).orders:[];
 render();
}
async function initialize(){
 repaintText();
 try{products=(await request('/catalog')).products;}catch(error){message(readable(error),true);}
 try{await loadAccount();}catch(error){message(readable(error),true);render();}
}
el('lang-en').addEventListener('click',()=>{lang='en';localStorage.setItem('routine_pack_language',lang);repaintText();});
el('lang-uk').addEventListener('click',()=>{lang='uk';localStorage.setItem('routine_pack_language',lang);repaintText();});
el('signin-form').addEventListener('submit',async event=>{
 event.preventDefault();const email=el('email').value.trim(),password=el('password').value;
 if(!email){message(tr('emailRequired'),true);return;}
 const button=el('signin-button');button.disabled=true;
 try{const result=await request('/auth/password/login','POST',{email,password});access=result.accessToken;sessionStorage.setItem(sessionKey,access);await loadAccount();message(tr('signed'));}catch(error){message(readable(error),true);}finally{button.disabled=false;}
});
el('logout').addEventListener('click',async()=>{
 try{await request('/auth/logout','POST');}catch{}
 access='';sessionStorage.removeItem(sessionKey);account=null;cart=[];adminOrders=[];message('');render();
});
el('products').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-product]');if(!button)return;
 if(!access){message(tr('signinFirst'),true);el('email').focus();return;}
 const code=button.dataset.product;button.disabled=true;
 const next=cart.includes(code)?cart.filter(x=>x!==code):[...cart,code];
 try{const result=await request('/cart','PUT',{productCodes:next});cart=result.productCodes;render();}catch(error){message(readable(error),true);render();}
});
el('order-button').addEventListener('click',async()=>{
 const button=el('order-button');button.disabled=true;
 try{await request('/orders','POST',{idempotencyKey:crypto.randomUUID()});await loadAccount();message(tr('orderCreated'));}catch(error){message(readable(error),true);}finally{render();}
});
el('orders').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-order]');if(!button)return;button.disabled=true;
 try{
  const url='/orders/'+button.dataset.order+'/files/'+button.dataset.code+'/'+button.dataset.index+'/ticket';
  const result=await request(url,'POST');
  location.assign(result.url);
 }catch(error){message(readable(error),true);button.disabled=false;}
});
el('admin-orders').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-approve]');if(!button||!confirm(tr('check')))return;
 button.disabled=true;
 try{await request('/admin/orders/'+button.dataset.approve+'/approve','POST');await loadAccount();message(tr('approvedNow'));}catch(error){message(readable(error),true);button.disabled=false;}
});
initialize();
})();
