'use strict';
// One-off encrypted metadata export; never exports Drive credentials or content.
const crypto=require('node:crypto');
const {GoogleAuth}=require('google-auth-library');
const {inspectDriveFolder}=require('./check-drive-files');
async function main(){
 const [publicDer,...folders]=process.argv.slice(2);
 const publicKey=crypto.createPublicKey({key:Buffer.from(publicDer,'base64'),format:'der',type:'spki'});
 const credentials=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
 const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
 const token=await auth.getAccessToken();
 const inventories=[];
 for(const folder of folders){
  if(!/^[-\w]{10,128}$/.test(folder))throw Error();
  const files=await inspectDriveFolder(folder,[],token);
  if(!files)throw Error();
  inventories.push({folder,files});
 }
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const payload=Buffer.concat([cipher.update(JSON.stringify(inventories),'utf8'),cipher.final()]);
 const envelope={key:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:payload.toString('base64')};
 console.log('ENCRYPTED INVENTORY: '+JSON.stringify(envelope));
}
main().catch(()=>{console.error('Inventory export failed; no credentials exported.');process.exitCode=1;});
