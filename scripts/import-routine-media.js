'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createWriteStream } = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const exec = require('node:util').promisify(require('node:child_process').execFile);
const { GoogleAuth } = require('google-auth-library');
const routines = require('../config/routine-media.json');

async function importRoutineMedia(settings, root = path.join(__dirname, '..', 'web')) {
  const auth = new GoogleAuth({
    credentials: JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const token = await auth.getAccessToken();
  if (!token) throw Error('Routine media: missing Drive access token.');
  const destination = path.join(root, 'assets', 'routine-previews');
  await fs.mkdir(destination, { recursive: true });
  const endpoint = id => 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true';
  const headers = { Authorization: 'Bearer ' + token };
  let next = 0;
  await Promise.all(Array.from({length: 3}, async () => {
    while (next < routines.length) {
      const { slug, videoId, files = [] } = routines[next++];
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'routine-media-'));
      try {
        for (const { fileId } of files) {
          const audio = await fetch(endpoint(fileId), {
            headers: { ...headers, Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000)
          });
          await audio.body?.cancel();
          if (!audio.ok || !/^audio\//i.test(audio.headers.get('content-type') || '')) {
            throw Error('Audio unavailable: HTTP ' + audio.status);
          }
        }
        const source = path.join(temp, 'source.mov');
        const response = await fetch(endpoint(videoId), { headers, signal: AbortSignal.timeout(180000) });
        if (!response.ok || !response.body || !/^video\//i.test(response.headers.get('content-type') || '')) {
          await response.body?.cancel();
          throw Error('Video unavailable: HTTP ' + response.status);
        }
        await pipeline(Readable.fromWeb(response.body), createWriteStream(source));
        const video = path.join(destination, slug + '.mp4');
        const ffmpeg = (args, timeout) => exec('ffmpeg', ['-v', 'error', '-y', '-threads', '2', ...args], { timeout });
        await ffmpeg(['-i', source, '-t', '40', '-map', '0:v:0', '-map', '0:a:0?',
          '-vf', "scale=w='min(iw,960)':h='min(ih,960)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '23',
          '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', video], 180000);
        await ffmpeg(['-ss', '1', '-i', video, '-frames:v', '1', '-update', '1', path.join(destination, slug + '.jpg')], 30000);
        console.log('Imported routine preview: ' + slug);
      } catch (error) {
        throw Error('Routine media ' + slug + ': ' + error.message);
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    }
  }));
  const storefront = path.join(root, 'storefront-refresh.js');
  const source = await fs.readFile(storefront, 'utf8');
  const metadata = routines.map(({ slug, title, tier }) => ({ slug, title, tier }));
  await fs.writeFile(storefront, source.replace(
    /\/\* routine-media:start \*\/.*?\/\* routine-media:end \*\//s,
    '/* routine-media:start */' + JSON.stringify(metadata) + '/* routine-media:end */'
  ));
}

module.exports = { importRoutineMedia };
