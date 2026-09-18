import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const base=new URL('./',import.meta.url);
const record=JSON.parse(await readFile(new URL('native-inputs.json',base),'utf8'));
for(const [name,digest] of Object.entries({...record.files,[record.tarball]:record.sha256})) {
 assert.match(name,/^[a-z0-9][a-z0-9.-]+$/);assert.match(digest,/^[a-f0-9]{64}$/);
 assert.equal(createHash('sha256').update(await readFile(new URL(name,base))).digest('hex'),digest,`changed native input ${name}`);
}
