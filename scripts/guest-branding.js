'use strict';
const fs = require('node:fs');
const sharp = require('sharp');
async function main() {
  fs.mkdirSync('drivers/guest-mode/assets/images', { recursive: true });
  for (const [name, width, height] of [['small', 75, 75], ['large', 500, 500], ['xlarge', 1000, 1000]]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" rx="22" fill="#0f172a"/><g transform="translate(15 8) scale(.7)" fill="none" stroke="#e8441a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 45 50 12 90 45M21 38v49h58V38"/><circle cx="41" cy="48" r="8"/><path d="M28 75v-5a13 13 0 0 1 26 0v5M63 49v18m-9-9h18"/></g><rect x="37" y="78" width="26" height="12" rx="6" fill="#e8441a"/><circle cx="57" cy="84" r="4" fill="white"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`drivers/guest-mode/assets/images/${name}.png`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
