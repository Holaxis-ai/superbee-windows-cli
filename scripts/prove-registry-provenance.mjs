// Explicit live integration proof; ordinary unit tests do not claim cryptographic verification.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { verifyInputs } from './inputs.mjs';
import { verifyProvenance } from './provenance.mjs';
import { verifyInstalledInputs } from './registry-inputs.mjs';
const inputs=await verifyInputs(new URL('../inputs/inputs.json',import.meta.url));
await verifyInstalledInputs(inputs);
const bundle=JSON.parse(await readFile(new URL('../inputs/provenance.json',import.meta.url),'utf8'));
const cli=inputs.packages.find(p=>p.name==='@superbee/cli');
const check=(evidence,version=cli.version,digest=cli.sha256)=>verifyProvenance(evidence,version,digest,fileURLToPath(new URL('../inputs/tuf-cache',import.meta.url)));
console.log('GREEN live locked bytes + signature/certificate/logs + installed engine identity');
await assert.rejects(check({}));console.log('RED missing signed evidence');
const changed=structuredClone(bundle);changed.dsseEnvelope.payload=Buffer.from(Buffer.from(changed.dsseEnvelope.payload,'base64').toString().replace(inputs.provenance.commit,'0'.repeat(40))).toString('base64');
await assert.rejects(check(changed));console.log('RED changed signed source');
await assert.rejects(check(bundle,'9.9.9'));console.log('RED wrong release identity');
await assert.rejects(check(bundle,cli.version,'0'.repeat(64)));console.log('RED wrong subject');
