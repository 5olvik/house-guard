'use strict';
const fs=require('node:fs'),sharp=require('sharp');
async function main(){
  const dir='drivers/alarm-panel/assets';fs.mkdirSync(`${dir}/images`,{recursive:true});
  const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960"><g fill="none" stroke="#000" stroke-width="45" stroke-linejoin="round" stroke-linecap="round"><rect x="130" y="80" width="700" height="800" rx="80"/><path d="M250 230h460v220H250zM300 580h30m135 0h30m135 0h30M300 710h30m135 0h30m135 0h30"/><path d="m395 337 60 60 120-120"/></g></svg>';
  fs.writeFileSync(`${dir}/icon.svg`,icon);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect width="500" height="500" fill="white"/><rect x="105" y="52" width="290" height="402" rx="34" fill="#e2e8f0"/><rect x="95" y="42" width="290" height="402" rx="34" fill="#f8fafc" stroke="#94a3b8" stroke-width="3"/><rect x="127" y="92" width="226" height="137" rx="12" fill="#162437"/><path d="m181 160 40 39 78-79" fill="none" stroke="#e8441a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><g fill="#cbd5e1"><rect x="138" y="270" width="48" height="35" rx="8"/><rect x="216" y="270" width="48" height="35" rx="8"/><rect x="294" y="270" width="48" height="35" rx="8"/><rect x="138" y="334" width="48" height="35" rx="8"/><rect x="216" y="334" width="48" height="35" rx="8"/><rect x="294" y="334" width="48" height="35" rx="8"/></g></svg>';
  for(const [name,size]of [['small',75],['large',500],['xlarge',1000]])await sharp(Buffer.from(svg)).resize(size,size).png().toFile(`${dir}/images/${name}.png`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
