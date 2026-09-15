const fs = require('fs/promises');
const path = require('path');

const origin = 'https://mukvik-routine-pack.mukvik1.chatgpt.site';
const token = process.env.SITES_BYPASS_TOKEN;
const files = [
  'assets/artwork.png',
  'assets/mukvik-logo.png',
  'assets/routine-pack.png',
  ...Array.from({ length: 5 }, (_, index) => `assets/videos/poster-${index + 1}.jpg`),
  ...Array.from({ length: 5 }, (_, index) => `assets/videos/video-${index + 1}.mp4`)
];

if (!token) throw new Error('SITES_BYPASS_TOKEN is required during the Railway build');

async function download(relativePath) {
  const response = await fetch(`${origin}/${relativePath}`, {
    headers: { 'OAI-Sites-Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Failed to download ${relativePath}: HTTP ${response.status}`);
  const destination = path.join(__dirname, 'web', relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${relativePath}`);
}

Promise.all(files.map(download)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
