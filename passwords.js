'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};

function validPassword(value){
 return typeof value==='string'&&value.length>=8&&value.length<=128&&Buffer.byteLength(value,'utf8')<=512;
}
async function hashPassword(password){
 if(!validPassword(password))throw new Error('Password must contain 8 to 128 characters.');
 const salt=crypto.randomBytes(16);
 const derived=await scrypt(password,salt,64,options);
 return ['scrypt','32768','8','3',salt.toString('base64url'),derived.toString('base64url')].join('$');
}
async function verifyPassword(password,stored){
 if(!validPassword(password)||typeof stored!=='string')return false;
 const parts=stored.split('$');
 if(parts.length!==6||parts[0]!=='scrypt'||parts[1]!=='32768'||parts[2]!=='8'||parts[3]!=='3')return false;
 const salt=Buffer.from(parts[4],'base64url'),expected=Buffer.from(parts[5],'base64url');
 if(salt.length!==16||expected.length!==64)return false;
 const derived=await scrypt(password,salt,64,options);
 return crypto.timingSafeEqual(derived,expected);
}
module.exports={validPassword,hashPassword,verifyPassword};
