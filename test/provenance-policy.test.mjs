import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationPolicy } from 'sigstore/dist/config.js';
import { verifySubjectAlternativeName, verifyExtensions } from '@sigstore/verify/dist/policy.js';
import { certificatePolicy, repository, workflowPath } from '../scripts/provenance.mjs';

test('actual Sigstore policy matches only the exact release certificate identity',()=>{
 const version='0.1.0-pre.1';
 const expected=`${repository}/${workflowPath}@refs/tags/cli/v${version}`;
 const policy=createVerificationPolicy(certificatePolicy(version));
 verifySubjectAlternativeName(policy.subjectAlternativeName,expected);
 for(const identity of [expected+'0',expected+'-evil',expected+'\n','prefix'+expected,
  expected.replace('github.com','githubXcom'),expected.replace('.github/','Xgithub/'),
  expected.replace('library.yml','libraryXyml'),expected.replace('v0.1.0','v0X1X0'),undefined]) {
  assert.throws(()=>verifySubjectAlternativeName(policy.subjectAlternativeName,identity),/certificate identity error/);
 }
});

test('actual Sigstore issuer policy uses literal equality, rejecting altered issuer',()=>{
 const policy=createVerificationPolicy(certificatePolicy('0.1.0-pre.1'));
 const issuer='https://token.actions.githubusercontent.com';
 verifyExtensions(policy.extensions,{issuer});
 for(const changed of [issuer+'.evil',issuer+'\n',issuer.replace('token.actions','tokenXactions'),'https://evil.test',undefined]) {
  assert.throws(()=>verifyExtensions(policy.extensions,{issuer:changed}),/invalid certificate extension/);
 }
});
