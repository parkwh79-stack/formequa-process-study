import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const dist=path.resolve(root,'dist');
if(path.dirname(dist)!==path.resolve(root)||path.basename(dist)!=='dist')throw new Error('Invalid static output directory');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
for(const entry of ['index.html','style.css','js'])await fs.cp(path.join(root,entry),path.join(dist,entry),{recursive:true});
// Link-preview image (og:image). GitHub Actions renders it fresh with scripts/og-image.mjs; a local copy is used when present.
try { await fs.cp(path.join(root,'og-image.png'),path.join(dist,'og-image.png')); } catch { /* generated in CI */ }
console.log('Static build: index.html, style.css and js/ → dist/');
