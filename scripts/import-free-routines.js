'use strict';
// Only explicitly selected promotional videos and free audio belong in this manifest.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const {GoogleAuth}=require('google-auth-library');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zipAudio(files){
 const local=[],central=[];let offset=0;
 for(const {name,bytes} of files){
  if(!/^[^/\\\x00]+\.mp3$/i.test(name)||bytes.length>0xffffffff)throw Error('Invalid free audio entry.');
  const filename=Buffer.from(name),crc=crc32(bytes),header=Buffer.alloc(30),directory=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(33,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
  directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(33,14);
  directory.writeUInt32LE(crc,16);directory.writeUInt32LE(bytes.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  local.push(header,filename,bytes);central.push(directory,filename);offset+=header.length+filename.length+bytes.length;
 }
 const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,index,end]);
}
function addFreeCards(html,routines){
 for(const r of routines){
  if(html.includes('data-routine-card="'+r.slug+'"'))continue;
  const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title=escape(r.title),base='/assets/free-videos/'+r.slug;
  const card=`<article class="free-video-card" data-routine-card="${r.slug}" data-detail-href="/free/${r.slug}/" tabindex="0"><video class="free-routine-video" controls playsinline preload="none" poster="${base}.jpg" aria-label="${title}"><source src="${base}.mp4" type="video/mp4"></video><div><h3>${title}</h3><p>${r.audio.length} MP3 files · ZIP download</p><a class="download-button" href="/free/${r.slug}/" data-i18n="OPEN ROUTINE">OPEN ROUTINE</a></div></article>`;
  const anchor='</article></div></section>';
  if(!html.includes(anchor))throw Error('Free catalog structure changed; cannot add routine safely.');
  html=html.replace(anchor,'</article>'+card+'</div></section>');
 }
 return html.replace(/data-i18n="on Instagram to unlock all three free routines\. Downloads start directly from RoutinePack\."/g,'').replace(/on Instagram to unlock all three free routines\./g,'on Instagram to unlock free routines.');
}
async function importFreeRoutines(settings,{root=path.join(__dirname,'..','web')}={}){
 const routines=require('../config/free-routines.json');
 if(!routines.length)return;
 const auth=new GoogleAuth({credentials:JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/drive.readonly']});
 const token=await auth.getAccessToken(),headers={Authorization:'Bearer '+token};
 const read=async(id,type)=>{
  if(!/^[-\w]{10,128}$/.test(id))throw Error('Invalid free file mapping.');
  const r=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media&supportsAllDrives=true',{headers,signal:AbortSignal.timeout(180000)});
  if(!r.ok||!String(r.headers.get('content-type')).startsWith(type))throw Error('Free media unavailable: HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length)throw Error('Free media is empty.');return bytes;
 };
 for(const r of routines){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug))throw Error('Invalid free routine slug.');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'routine-free-'));
  try{
   await fs.writeFile(path.join(temp,'source.mov'),await read(r.videoFileId,'video/'));
   const destination=path.join(root,'assets','free-videos');await fs.mkdir(destination,{recursive:true});
   await exec('ffmpeg',['-v','error','-y','-i',path.join(temp,'source.mov'),'-map','0:v:0','-map','0:a:0?','-vf','scale=trunc(iw*min(1\\,1280/ih)/2)*2:trunc(ih*min(1\\,1280/ih)/2)*2','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',path.join(destination,r.slug+'.mp4')],{timeout:240000});
   await exec('ffmpeg',['-v','error','-y','-i',path.join(destination,r.slug+'.mp4'),'-frames:v','1','-update','1',path.join(destination,r.slug+'.jpg')],{timeout:30000});
   const audio=[];for(const file of r.audio)audio.push({name:file.name,bytes:await read(file.fileId,'audio/')});
   const downloads=path.join(root,'downloads');await fs.mkdir(downloads,{recursive:true});await fs.writeFile(path.join(downloads,r.slug+'.zip'),zipAudio(audio));
   console.log('Imported free routine: '+r.slug);
  }finally{await fs.rm(temp,{recursive:true,force:true});}
 }
 const catalog=path.join(root,'free','index.html');await fs.writeFile(catalog,addFreeCards(await fs.readFile(catalog,'utf8'),routines));
}
module.exports={importFreeRoutines,zipAudio,crc32,addFreeCards};
