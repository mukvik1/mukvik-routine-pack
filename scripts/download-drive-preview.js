'use strict';
const {GoogleAuth}=require('google-auth-library');
async function downloadDrivePreview(settings,{fetchImpl=fetch,getToken,save}={}){
 const id=settings.PREVIEW_VIDEO_6_DRIVE_FILE_ID;
 if(!/^[-\w]{10,128}$/.test(id||''))throw Error('Sixth preview video is not configured.');
 const auth=new GoogleAuth({credentials:JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON),scopes:['https://www.googleapis.com/auth/drive.readonly']});
 const token=await (getToken||auth.getAccessToken.bind(auth))();
 const headers={Authorization:'Bearer '+token};
 const free=JSON.parse(settings.FREE_PREVIEW_FILES_JSON||'{}');
 const sources=[{id,video:'video-6.mp4',poster:'poster-6.jpg'},...Object.entries(free).map(([slug,fileId])=>{
  if(!['get-right-x-just-a-lil-bit','work-it-x-candy-shop','rihanna-routine'].includes(slug)||!/^[-\w]{10,128}$/.test(fileId))throw Error('Invalid free preview mapping.');
  return {id:fileId,video:'free-'+slug+'.mp4',poster:'free-'+slug+'.jpg'};
 })];
 for(const source of sources){
 const endpoint='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(source.id);
 const metadata=await fetchImpl(endpoint+'?fields=mimeType,thumbnailLink&supportsAllDrives=true',{headers,signal:AbortSignal.timeout(30000)});
 if(!metadata.ok)throw Error('Preview metadata unavailable: HTTP '+metadata.status);
 const info=await metadata.json();
 if(info.mimeType!=='video/mp4'||!info.thumbnailLink)throw Error('Preview must be an MP4 with a Drive thumbnail.');
 const thumbnail=new URL(info.thumbnailLink);
 if(thumbnail.protocol!=='https:'||!thumbnail.hostname.endsWith('.googleusercontent.com'))throw Error('Untrusted preview thumbnail host.');
 for(const [url,name,type] of [[endpoint+'?alt=media&supportsAllDrives=true',source.video,'video/'],[thumbnail.href,source.poster,'image/']]){
  const response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(180000)});
  if(!response.ok||!String(response.headers.get('content-type')).startsWith(type))throw Error('Preview download failed: HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.length)throw Error('Preview download is empty.');
  await save(name,bytes);
 }
 }
}
module.exports={downloadDrivePreview};
