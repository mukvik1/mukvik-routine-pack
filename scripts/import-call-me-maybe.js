'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const {GoogleAuth}=require('google-auth-library');
const slug='call-me-maybe-poker-face';
function prependCard(html,card){
 if(html.includes('data-product-id="routine12"'))return html;
 const anchor='<div class="coming-grid individual-grid">';
 if(!html.includes(anchor))throw Error('Routine catalogue structure changed.');
 return html.replace(anchor,anchor+card.trim());
}
async function importCallMeMaybe(settings,{root=path.join(__dirname,'..','web')}={}){
 const auth=new GoogleAuth({credentials:JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/drive.readonly']});
 const token=await auth.getAccessToken();
 const response=await fetch('https://www.googleapis.com/drive/v3/files/1yS5wGDH0YO4jcJIVELklrSyfyAjaGdnT?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)});
 if(!response.ok||!String(response.headers.get('content-type')).startsWith('video/'))throw Error('Call Me Maybe preview unavailable: HTTP '+response.status);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'routine-paid-'));
 try{
  const source=path.join(temp,'source.mp4');await fs.writeFile(source,Buffer.from(await response.arrayBuffer()));
  const directory=path.join(root,'assets','individual-previews');await fs.mkdir(directory,{recursive:true});
  const video=path.join(directory,slug+'.mp4');
  await exec('ffmpeg',['-v','error','-y','-i',source,'-t','40','-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',video],{timeout:240000});
  await exec('ffmpeg',['-v','error','-y','-i',video,'-frames:v','1','-update','1',path.join(directory,slug+'.jpg')],{timeout:30000});
  const catalog=path.join(root,'routines','index.html');
  const card=await fs.readFile(path.join(__dirname,'..','config','call-me-maybe-card.html'),'utf8');
  await fs.writeFile(catalog,prependCard(await fs.readFile(catalog,'utf8'),card));
  console.log('Imported paid routine: '+slug);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
module.exports={importCallMeMaybe,prependCard};
