import { readFile } from 'node:fs/promises';
import { sha256 } from './inputs.mjs';
process.stdout.write(sha256(await readFile(new URL('./windows-installed-package-proof.mjs',import.meta.url)))+'\n');
