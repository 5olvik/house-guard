'use strict';
const fs = require('node:fs');
const sharp = require('sharp');
async function main() {
  fs.mkdirSync('assets/images', { recursive: true });
  for (const [name, w, h] of [['small', 250, 175], ['large', 500, 350], ['xlarge', 1000, 700]]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 500 350"><defs><linearGradient id="b"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs><rect width="500" height="350" fill="url(#b)"/><path fill="none" stroke="#e8441a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" d="m195 124 55-47 55 47m-94-13v70h27v-33h24v33h27v-70"/><text x="250" y="245" text-anchor="middle" font-size="42" fill="white" font-family="sans-serif" font-weight="700">House Guard</text><text x="250" y="280" text-anchor="middle" font-size="16" fill="#b9c4d6" font-family="sans-serif">HJEMME · BORTE · NATT</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`assets/images/${name}.png`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
