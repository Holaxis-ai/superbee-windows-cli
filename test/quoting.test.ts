import assert from 'node:assert/strict';
import test from 'node:test';
import { renderWindowsToken, renderGeneratedHookToken, lexicalHookTokens } from '../src/quoting.js';

test('Windows renderer quotes inert values and preserves apostrophes and internal backslashes',()=>{
  for(const value of ['Context Note','Task\\Sub',"owner's task",'‘single’',"it's",'<value-omitted-unquotable>']) assert.equal(renderWindowsToken(value),`"${value}"`);
  assert.equal(renderWindowsToken('C:\\dir\\'),'"C:\\dir\\\\"');
});
test('Windows renderer refuses quote terminators, expansion sigils, controls and percent expansion',()=>{
  for(const char of ['"','\u201c','\u201d','\u201e','\u201f','\u2033','\u2036','\u275d','\u275e','\u301d','\u301e','\u301f','\uff02','$','`','!','%','\uff40','\0','\n','\x7f']) assert.equal(renderWindowsToken('a'+char+'b'),undefined,JSON.stringify(char));
  for(const value of ['%USERNAME%','50%','http://x/a%20b','a\\"b']) assert.equal(renderWindowsToken(value),undefined);
});
test('Windows hook writer and exact lexer round trip generated path tokens',()=>{
  const input=['C:\\Program Files\\node.exe','C:\\npm\\node_modules\\@superbee\\windows-cli\\dist\\superbee-windows.mjs','session-start'];
  const emitted=input.map(renderGeneratedHookToken).join(' ');
  assert.deepEqual(lexicalHookTokens(emitted)?.map(row=>row.value),input.map(v=>v.replaceAll('\\','/')));
  for(const foreign of [' superbee-windows session-start','superbee-windows  session-start','"superbee-windows" session-start','superbee-windows session-start ','superbee-windows session-start; echo x','"C:/x"y session-start']) assert.equal(lexicalHookTokens(foreign),undefined,foreign);
  for(const value of ['%HOME%','$x','!x!','`x','a"b','a\nb']) assert.throws(()=>renderGeneratedHookToken(value),/grammar/);
});
