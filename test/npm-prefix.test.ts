import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { npmPrefixInvocation } from "../src/host.js";

test("Windows npm-prefix probing binds npm to the running Node installation, not PATH", () => {
  const node = String.raw`C:\Program Files\nodejs\node.exe`;
  const npmCli = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
  const foreign = String.raw`C:\foreign\npm.cmd`;
  const calls: string[] = [];
  const resolve = (candidate: string) => {
    calls.push(candidate);
    const normalized = path.win32.normalize(candidate).toLowerCase();
    if (normalized === node.toLowerCase()) return node;
    if (normalized === npmCli.toLowerCase()) return npmCli;
    if (normalized === foreign.toLowerCase()) return foreign;
    return undefined;
  };
  const safe = npmPrefixInvocation(node, resolve);
  assert.deepEqual(safe, { command: node, args: [npmCli, "prefix", "--global"] });
  assert.equal(calls.includes(foreign), false, "foreign npm.cmd is never resolved or executed");
  assert.equal(calls.some((candidate) => candidate.toLowerCase().endsWith("npm.cmd")), false);
});

test("Windows npm-prefix probing fails closed for missing or ambiguous runtime layouts", () => {
  const node = String.raw`C:\Program Files\nodejs\node.exe`;
  const npmCli = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`;
  const foreignNpmCli = String.raw`D:\foreign\npm-cli.js`;
  const resolveNodeOnly = (candidate: string) => path.win32.normalize(candidate).toLowerCase() === node.toLowerCase()
    ? node
    : undefined;
  assert.equal(npmPrefixInvocation(node, resolveNodeOnly), undefined, "missing npm CLI");
  assert.equal(npmPrefixInvocation(node, () => undefined), undefined, "missing runtime");
  assert.equal(npmPrefixInvocation("node.exe", resolveNodeOnly), undefined, "relative runtime");
  assert.equal(npmPrefixInvocation(String.raw`C:\Program Files\nodejs\node2.exe`, resolveNodeOnly), undefined, "unexpected runtime identity");
  assert.equal(npmPrefixInvocation(node, (candidate) => {
    const normalized = path.win32.normalize(candidate).toLowerCase();
    if (normalized === node.toLowerCase()) return node;
    if (normalized === npmCli.toLowerCase()) return foreignNpmCli;
    return undefined;
  }), undefined, "npm CLI escaping the proven runtime installation");
});

test("Windows npm-prefix probing rejects npx cache segments case-insensitively", () => {
  for (const segment of ["_npx", "_NPX", "_NpX"]) {
    const runtime = path.win32.join(String.raw`C:\Users\mike\AppData\Local\npm-cache`, segment, "1", "node.exe");
    assert.equal(
      npmPrefixInvocation(runtime, (candidate) => candidate),
      undefined,
      segment,
    );
  }
});
