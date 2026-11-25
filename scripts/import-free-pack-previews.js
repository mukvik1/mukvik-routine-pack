'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const exec = require('node:util').promisify(require('node:child_process').execFile);
const { GoogleAuth } = require('google-auth-library');
const { catalogFiles, FREE_PACK_SLUGS } = require('../standard-subscription');

async function importFreePackPreviews(settings, { root = path.join(__dirname, '..', 'web') } = {}) {
 const files = { ...require('../config/additional-product-files.json'), ...JSON.parse(settings.COMMERCE_FILES_JSON) };
 const entries = catalogFiles(files);
 const auth = new GoogleAuth({ credentials: JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
 const token = await auth.getAccessToken();
 const destination = path.join(root, 'assets', 'free-videos');
 await fs.mkdir(destination, { recursive: true });
 const privateRoot=path.join(root,'..','private-routine-videos');
 await fs.mkdir(privateRoot,{recursive:true});
 for (const { id, slug } of require('../config/routine-paths.json')) {
  const isFree = FREE_PACK_SLUGS.includes(id);
  const file = entries.get(id)?.find(entry => /\.mp4$/i.test(entry.name));
  if (!file) throw Error('Missing pack source: ' + id);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'routine-free-pack-'));
  try {
   const source = path.join(temp, 'source.mp4');
   const response = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.fileId) + '?alt=media&supportsAllDrives=true', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(180000)
   });
   if (!response.ok || !response.body) throw Error('Pack video unavailable: ' + id + ' HTTP ' + response.status);
   await pipeline(Readable.fromWeb(response.body), createWriteStream(source));
   const privatePoster = path.join(privateRoot, id + '.jpg');
   if (!isFree) {
    await exec('ffmpeg', ['-v','error','-y','-ss','1','-i',source,'-frames:v','1',
     '-vf',"scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease:force_divisible_by=2",
     '-q:v','2','-update','1',privatePoster], { timeout: 30000 });
    continue;
   }
   const output = path.join(destination, slug + '.mp4');
   await exec('ffmpeg', ['-v','error','-y','-i',source,'-map','0:v:0','-map','0:a:0?','-vf','scale=trunc(iw*min(1\\,1280/ih)/2)*2:trunc(ih*min(1\\,1280/ih)/2)*2','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',output], { timeout: 240000 });
   await exec('ffmpeg', ['-v','error','-y','-ss','1','-i',output,'-frames:v','1','-q:v','2','-update','1',path.join(destination,slug+'.jpg')], { timeout: 30000 });
   await fs.copyFile(path.join(destination,slug+'.jpg'),privatePoster);
   console.log('Imported Free pack preview: ' + slug);
  } finally {
   await fs.rm(temp, { recursive: true, force: true });
  }
 }
}
module.exports = { importFreePackPreviews };
