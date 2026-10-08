'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validPassword,hashPassword,verifyPassword}=require('../passwords');

test('passwords are salted adaptive hashes and can be verified',async()=>{
 const password='simplepass123';
 const first=await hashPassword(password),second=await hashPassword(password);
 assert.notEqual(first,second);
 assert.ok(!first.includes(password));
 assert.equal(await verifyPassword(password,first),true);
 assert.equal(await verifyPassword('wrongpassword',first),false);
 assert.equal(await verifyPassword(password,first.replace('scrypt$','other$')),false);
 assert.equal(validPassword('short'),false);
 assert.equal(validPassword(password),true);
 await assert.rejects(()=>hashPassword('short'));
});
