'use strict';
const fs=require('node:fs'),sharp=require('sharp');
async function main(){
  const dir='drivers/night-mode/assets/images';fs.mkdirSync(dir,{recursive:true});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="3" y="3" width="94" height="94" rx="22" fill="#0f172a"/><g transform="translate(11 8) scale(.78)" fill="none" stroke="#e8441a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M65 12a38 38 0 1 0 23 59A32 32 0 0 1 65 12Z"/><path d="M24 15v12m-6-6h12M85 29v10m-5-5h10" stroke-width="3"/></g><rect x="37" y="78" width="26" height="12" rx="6" fill="#e8441a"/><circle cx="57" cy="84" r="4" fill="white"/></svg>';
  for(const [name,size]of [['small',75],['large',500],['xlarge',1000]])await sharp(Buffer.from(svg)).resize(size,size).png().toFile(`${dir}/${name}.png`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
