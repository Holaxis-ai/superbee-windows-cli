import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { sha256 } from './inputs.mjs';
import { build } from 'esbuild';
const inputs=JSON.parse(await readFile('out/build-inputs.json','utf8')).inputs;
const core=inputs.packages.find(pkg=>pkg.name==='@superbee/core');
await copyFile(core.file,'out/'+core.filename);
await build({entryPoints:['test/native-adapters.ts'],outfile:'out/native-adapters.mjs',bundle:true,platform:'node',format:'esm',target:'node20',external:['@superbee/core/filesystem']});
const proof=JSON.parse(await readFile('out/package-proof.json','utf8'));
const files={['native-adapters.mjs']:sha256(await readFile('out/native-adapters.mjs')),[core.filename]:sha256(await readFile('out/'+core.filename))};
await writeFile('out/package.json',JSON.stringify({name:'windows-native-proof',private:true,type:'module'})+'\n');
files['package.json']=sha256(await readFile('out/package.json'));
for(const name of ['windows-installed-package-proof.mjs','check-native-inputs.mjs']) {
 await copyFile(`scripts/${name}`,`out/${name}`);files[name]=sha256(await readFile(`out/${name}`));
}
assert.match(proof.sha256,/^[a-f0-9]{64}$/);
await writeFile('out/native-inputs.json',JSON.stringify({...proof,coreTarball:core.filename,files},null,2)+'\n');
