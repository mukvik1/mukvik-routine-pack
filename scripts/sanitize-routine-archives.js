'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');
const { ZipFile } = require('yazl');
const { isRoutineAudio } = require('../routine-audio');

async function sanitizeArchive(filename) {
  const input = await new Promise((resolve, reject) =>
    yauzl.open(filename, { lazyEntries: true, autoClose: false }, (error, zip) => error ? reject(error) : resolve(zip)));
  const temp = filename + '.audio-only';
  try {
    const entries = await new Promise((resolve, reject) => {
      const files = [];
      input.on('error', reject);
      input.on('entry', entry => { files.push(entry); input.readEntry(); });
      input.once('end', () => resolve(files));
      input.readEntry();
    });
    const audio = entries.filter(entry => isRoutineAudio(entry.fileName));
    if (!audio.length) throw Error('No audio in ' + path.basename(filename));
    if (audio.length === entries.length) return;
    const zip = new ZipFile();
    zip.on('error', error => zip.outputStream.destroy(error));
    for (const entry of audio) {
      zip.addReadStreamLazy(entry.fileName, { compress: false }, done => input.openReadStream(entry, done));
    }
    const output = pipeline(zip.outputStream, createWriteStream(temp));
    zip.end();
    await output;
    await fs.rename(temp, filename);
  } finally {
    input.close();
    await fs.rm(temp, { force: true });
  }
}

async function sanitizeRoutineArchives(root = path.join(__dirname, '..', 'web', 'downloads')) {
  for (const file of await fs.readdir(root)) {
    if (file.endsWith('.zip')) await sanitizeArchive(path.join(root, file));
  }
}

module.exports = { sanitizeArchive, sanitizeRoutineArchives };
