'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {removeLegacyStorefront}=require('../scripts/remove-legacy-storefront');

test('build strips the legacy cart and single-purchase actions before first paint',()=>{
 const menu='<button data-menu>Menu</button><div data-store-auth><button>Sign in</button></div>';
 const actions='<a href="/price/">Subscriptions</a><a data-direct-download href="/downloads/free.zip">Download</a>';
 const legacy='<button type="button" data-cart><svg><path /></svg><span data-cart-count>0</span></button>\n<a data-buy href="#store-cart">Buy</a>\n<a href="/packs/get-the-pack/">Get the Pack</a>';
 assert.equal(removeLegacyStorefront(menu+legacy+actions),menu+'\n\n'+actions);
});
