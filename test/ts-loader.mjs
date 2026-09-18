import { transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
    const source = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
    try { await readFile(source); return {url: source.href, shortCircuit: true}; } catch {}
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    const result = await transform(source, {loader:'ts', format:'esm', target:'node20', sourcefile:fileURLToPath(url)});
    return {format:'module', source:result.code, shortCircuit:true};
  }
  return nextLoad(url, context);
}
