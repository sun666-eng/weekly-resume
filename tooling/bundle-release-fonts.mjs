import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(await readFile('packages/fonts/src/webfontlist.json','utf8'));
const manifest=JSON.parse(await readFile('packages/fonts/src/local-fonts.json','utf8'));
const primary=['Open Sans','Source Sans 3','Lato','Vazirmatn'];
const fallbacks=['Noto Serif KR','Noto Sans KR','Noto Serif JP','Noto Sans JP','Noto Serif TC','Noto Sans TC','Noto Naskh Arabic','Noto Sans Arabic','Noto Sans Hebrew','Noto Sans Thai','Noto Emoji'];
const records=[];
for (const family of [...primary,...fallbacks]) {
 const entry=catalog.find(v=>v.family===family);
 if(!entry)throw new Error('Missing family '+family);
 const slug=family.toLowerCase().replaceAll(' ','-');
 const folder='apps/web/public/fonts/'+slug;
 await mkdir(folder,{recursive:true});
 const weights=primary.includes(family)?entry.weights:['400','700'];
 const files={};
 for(const weight of weights){
  const url=entry.files[weight]??entry.files['400'];
  if(!url?.startsWith('https://fonts.gstatic.com/'))throw new Error('Unexpected font host');
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(family+' '+response.status);
  const data=Buffer.from(await response.arrayBuffer());
  if(!['00010000','4f54544f','74746366'].includes(data.subarray(0,4).toString('hex')))throw new Error('Invalid font '+family);
  await writeFile(folder+'/'+weight+'.ttf',data);
  files[weight]='/fonts/'+slug+'/'+weight+'.ttf';
  records.push({family,weight,url,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
 }
 const licenseUrl='https://raw.githubusercontent.com/google/fonts/main/ofl/'+family.toLowerCase().replaceAll(' ','')+'/OFL.txt';
 const license=await fetch(licenseUrl,{signal:AbortSignal.timeout(30000)});
 if(!license.ok)throw new Error('Missing license '+family+' '+license.status);
 const text=await license.text();
 if(!text.includes('SIL OPEN FONT LICENSE'))throw new Error('Unexpected license '+family);
 await writeFile(folder+'/OFL.txt',text);
 manifest[family]=files;
 console.log(family+': '+weights.length+' weights');
}
await writeFile('packages/fonts/src/local-fonts.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('apps/web/public/fonts/download-manifest.json',JSON.stringify(records,null,2)+'\n');
console.log('DONE '+records.length+' files, '+records.reduce((n,r)=>n+r.bytes,0)+' bytes');
