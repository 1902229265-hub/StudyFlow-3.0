import fs from'node:fs/promises';import path from'node:path';import prettier from'prettier';
const root=path.resolve(import.meta.dirname,'..'),files=[];
async function visit(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await visit(p);else if(/\.(ts|tsx)$/.test(p)||e.name==='phase2.css')files.push(p)}}await visit(path.join(root,'src'));
for(const name of['vite.config.ts','playwright.config.ts','index.html'])files.push(path.join(root,name));
for(const p of files){const old=await fs.readFile(p,'utf8'),next=await prettier.format(old,{filepath:p});if(old!==next)await fs.writeFile(p,next)}console.log(JSON.stringify({formatted:files.length,baselineCssUntouched:true}));
