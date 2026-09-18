import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const names=['@superbee/cli','@superbee/core'];
export const exactVersion=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?![\s\S])/;
export function validatePackage(pkg) {
 assert.ok(names.includes(pkg.name));assert.match(pkg.version ?? '',exactVersion,'exact registry version required');
 assert.equal(pkg.resolved,`https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/')[1]}-${pkg.version}.tgz`,'unexpected registry URL');
 assert.match(pkg.integrity ?? '',/^sha512-[A-Za-z0-9+/]{86}==(?![\s\S])/,'locked SHA512 integrity required');
 return pkg;
}
export function validateLockedPackages(manifest,lock) {
 assert.ok(!manifest.dependencies,'distribution must have no runtime dependencies');
 return names.map(name=>{
 const version=manifest.devDependencies?.[name];assert.match(version ?? '',exactVersion,'exact dependency required');
 assert.equal(lock.packages?.['']?.devDependencies?.[name],version,'root lock differs from manifest');
 const row=lock.packages?.['node_modules/'+name];assert.ok(row && !row.link,'locked package missing or linked');assert.equal(row.version,version);
 return validatePackage({name,version,resolved:row.resolved,integrity:row.integrity});
 });
}
export async function readLockedPackages(directory=root) {
 const bytes=await readFile(path.join(directory,'package-lock.json'));
 const manifest=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
 return {packages:validateLockedPackages(manifest,JSON.parse(bytes)),lockfileSha256:sha256(bytes)};
}
