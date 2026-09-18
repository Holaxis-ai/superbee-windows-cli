import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sha256 } from './inputs.mjs';
const [file,variable]=process.argv.slice(2);
assert.ok(file&&variable);
assert.match(process.env[variable]??'',/^[a-f0-9]{64}$/,'producer digest is missing');
assert.equal(sha256(await readFile(file)),process.env[variable],'producer artifact bytes changed');
