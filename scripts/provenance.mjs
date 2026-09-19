import assert from 'node:assert/strict';
import { createVerifier } from 'sigstore';
export const repository='https://github.com/Holaxis-ai/superbee';
export const workflowPath='.github/workflows/release-cli-library.yml';
export const fullSha=/^[a-f0-9]{40}(?![\s\S])/;
export function validateStatement(bundle, version, digest) {
 assert.equal(bundle.dsseEnvelope?.payloadType,'application/vnd.in-toto+json');
 const statement=JSON.parse(Buffer.from(bundle.dsseEnvelope.payload,'base64').toString('utf8'));
 assert.equal(statement._type,'https://in-toto.io/Statement/v1');
 assert.equal(statement.predicateType,'https://slsa.dev/provenance/v1');
 assert.equal(statement.subject?.length,1);assert.equal(statement.subject[0].name,'superbee-cli.tgz');
 assert.equal(statement.subject[0].digest?.sha256,digest,'attestation subject differs from tarball');
 const ref=`refs/tags/cli/v${version}`, identity=`${repository}/${workflowPath}@${ref}`;
 const definition=statement.predicate?.buildDefinition;
 assert.equal(definition?.buildType,'https://actions.github.io/buildtypes/workflow/v1');
 assert.deepEqual(definition.externalParameters?.workflow,{ref,repository,path:workflowPath});
 assert.equal(statement.predicate.runDetails?.builder?.id,identity);
 const sources=definition.resolvedDependencies?.filter(d=>d.uri===`git+${repository}@${ref}`);
 assert.equal(sources?.length,1,'one signed source dependency required');
 const commit=sources[0].digest?.gitCommit;assert.match(commit ?? '',fullSha);
 return {repository,workflow:workflowPath,ref,commit,subjectSha256:digest};
}
export function certificatePolicy(version) {
 const identity=`${repository}/${workflowPath}@refs/tags/cli/v${version}`;
 // Sigstore treats SAN strings as regexes; escape literals and reject even trailing newlines.
 const exactIdentity='^'+identity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\s\\S])';
 return {certificateIssuer:'https://token.actions.githubusercontent.com',certificateIdentityURI:exactIdentity};
}
export async function verifyProvenance(bundle, version, digest, cacheDirectory) {
 const verifier=await createVerifier({...certificatePolicy(version),
  ctLogThreshold:1,tlogThreshold:1,tufCachePath:cacheDirectory});
 verifier.verify(bundle);
 return validateStatement(bundle,version,digest);
}
export function validateEmbeddedEngine(record, coreVersion, signedCommit) {
 assert.equal(record.schema,'superbee.cli-embedded-engine.v2');
 assert.equal(record.source?.dirty,false,'embedded source must be clean');
 assert.match(record.source?.commit ?? '',fullSha);assert.equal(record.source.commit,signedCommit,'embedded source differs from signed source');
 const rows=record.packages?.filter(p=>p.name==='@superbee/core');assert.equal(rows?.length,1,'exactly one embedded core row required');
 assert.equal(rows[0].version,coreVersion,'embedded core differs from installed core');assert.equal(rows[0].release_tag,`libraries/v${coreVersion}`);
 return record;
}
