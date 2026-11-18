'use strict';

const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const exec = promisify(execFile);

const sourceUrl = 'https://drive.usercontent.google.com/download?id=1BjB4-PxMbix41dvUCX331DVqdmce3cNs&export=download&confirm=t';
const name = 'home-performance-06-disturbia';

async function importHomePerformance(destination, localSource) {
  const temp = await fs.mkdtemp(path.join(tmpdir(), 'rp-home-performance-'));
  try {
    const source = localSource || path.join(temp, 'source.mov');
    if (!localSource) {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(180000) });
      if (!response.ok || !/^(video\/|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) {
        throw new Error('Homepage performance download failed: HTTP ' + response.status);
      }
      await pipeline(response.body, createWriteStream(source));
    }
    await fs.mkdir(destination, { recursive: true });
    const video = path.join(destination, name + '.mp4');
    await exec('ffmpeg', ['-v','error','-y','-threads','2','-i',source,'-map','0:v:0','-map','0:a:0?',
      '-vf','scale=608:1080','-c:v','libx264','-preset','veryfast','-threads','2','-crf','21','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','160k','-movflags','+faststart',video], { timeout: 180000 });
    await exec('ffmpeg', ['-v','error','-y','-ss','1','-i',video,'-frames:v','1','-vf','scale=360:-2',
      '-update','1',path.join(destination,name+'.jpg')], { timeout: 30000 });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

module.exports = { importHomePerformance, name };
