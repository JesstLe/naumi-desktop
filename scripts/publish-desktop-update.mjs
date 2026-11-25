'use strict';
// Publishes a desktop release as a GitHub Release that doubles as the
// auto-update feed (latest.yml + NSIS installer). Notes come from CHANGELOG.md.
// Usage: node scripts/publish-desktop-update.mjs [--skip-build] [--prerelease] [--version x.y.z]
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {assertModelPickerRelease} from './native-model-picker-extension.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'JesstLe/naumi-desktop';

export function extractReleaseNotes(changelog, version) {
  if (typeof changelog !== 'string' || !/^\d+\.\d+\.\d+$/.test(String(version))) return '';
  const lines = changelog.split('\n');
  const collected = [];
  let active = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (active) break;
      const heading = line.replace(/^##\s+/, '').trim();
      const headingVersion = heading.replace(/^\[|\]$/g, '').split(/[\s(]/)[0].replace(/^\[|\]$/g, '');
      if (headingVersion === version) active = true;
      continue;
    }
    if (active) collected.push(line);
  }
  return collected.join('\n').trim();
}

export function injectReleaseNotes(manifest, notes) {
  if (typeof manifest !== 'string' || !/^version:\s*\d+\.\d+\.\d+$/m.test(manifest)) throw Error('RELEASE_MANIFEST_INVALID');
  if (typeof notes !== 'string' || !notes.trim()) throw Error('RELEASE_NOTES_INVALID');
  const lines = manifest.replace(/\r/g, '').split('\n').filter(line => line !== '');
  const kept = [];
  for (let index = 0; index < lines.length; index++) {
    if (/^releaseNotes:/.test(lines[index])) { while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) index++; continue; }
    kept.push(lines[index]);
  }
  const block = ['releaseNotes: |', ...notes.trim().split('\n').map(line => line.trim() ? '  ' + line : '')];
  return kept.join('\n') + '\n' + block.join('\n') + '\n';
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function releaseCommands({existing,tag,notesFile,installer,manifest,prerelease=false,targetCommitish}) {
  const repo=['--repo',REPO];
  return existing ? [
    ['release','edit',tag,...repo,'--notes-file',notesFile],
    ['release','upload',tag,...repo,installer,manifest,'--clobber'],
  ] : [['release','create',tag,...repo,'--title','Naumi Desktop '+tag,'--notes-file',notesFile,...(targetCommitish?['--target',targetCommitish]:[]),...(prerelease?['--prerelease']:[]),installer,manifest]];
}

function run(command, args, {cwd = root, env} = {}) {
  const shell = process.platform === 'win32' && /\.cmd$/i.test(command);
  const result = spawnSync(command, args, {cwd, env, stdio: 'inherit', shell});
  if (result.status !== 0) throw Error('RELEASE_COMMAND_FAILED ' + command + ' ' + args.join(' '));
}

function capture(command, args) {
  const shell = process.platform === 'win32' && /\.cmd$/i.test(command);
  const result = spawnSync(command, args, {encoding: 'utf8', shell});
  return {ok: result.status === 0, output: (result.stdout ?? '') + (result.stderr ?? '')};
}

export function assertEmbeddedPublication(manifest,ack=false){if(manifest.edition==='bundled-models'){if(!ack||manifest.personalCredentials!==true||manifest.modelControl?.mode!=='bundled'||manifest.accountModels||manifest.bundledModels?.distribution!=='release-bundled'||!Number.isInteger(manifest.bundledModels.models)||manifest.bundledModels.models<1||!(/^[a-f0-9]{64}$/).test(manifest.bundledModels.sha256))throw Error('BUNDLED_RELEASE_PUBLICATION_ACK_REQUIRED');return;} if(manifest.edition==='embedded-test'){if(!ack||manifest.personalCredentials!==true||manifest.embeddedModels?.distribution!=='two-user-test'||manifest.embeddedModels?.models!==4||!(/^[a-f0-9]{64}$/).test(manifest.embeddedModels?.sha256))throw Error('EMBEDDED_TEST_PUBLICATION_ACK_REQUIRED');}else if(manifest.personalCredentials)throw Error('PERSONAL_CREDENTIAL_PUBLICATION_FORBIDDEN');}

export function assertAccountModelsPublication(resource,{bundled=false}={}){if(bundled){assertEmbeddedPublication(resource,true);if(resource.edition!=='bundled-models')throw Error('BUNDLED_RELEASE_REQUIRED');return;}if(resource.personalCredentials||resource.embeddedModels||resource.trial||resource.accountModels?.required!==true||resource.accountModels?.protocol!==1)throw Error('ACCOUNT_MODEL_CLOUD_DISTRIBUTION_REQUIRED');}

function main() {
  const args = process.argv.slice(2);
  const desktop = path.join(root, 'desktop');
  const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
  const version = argValue('--version') ?? pkg.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('RELEASE_VERSION_INVALID ' + version);
  if (!args.includes('--skip-build')) run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {cwd: desktop});

  const output = path.join(root, 'runtime', 'naumi-desktop-release');
  const stagedManifest = path.join(root, 'runtime', 'desktop-backend', 'runtime-manifest.json');
  if (fs.existsSync(stagedManifest) && JSON.parse(fs.readFileSync(stagedManifest)).edition === 'internal-trial') throw Error('INTERNAL_TRIAL_PUBLICATION_FORBIDDEN');
  const resource=JSON.parse(fs.readFileSync(stagedManifest));
  assertEmbeddedPublication(resource,args.includes('--ack-embedded-test')||args.includes('--ack-bundled-models'));
  assertAccountModelsPublication(resource,{bundled:args.includes('--ack-bundled-models')});
  const manifest = path.join(output, 'latest.yml');
  const installer = path.join(output, `Naumi-Setup-${version}-x64.exe`);
  assertModelPickerRelease(output, version);
  for (const file of [manifest, installer]) if (!fs.existsSync(file)) throw Error('RELEASE_ARTIFACT_MISSING ' + file);
  if (fs.readFileSync(manifest, 'utf8').includes('Naumi-Test-Setup-')) throw Error('INTERNAL_TRIAL_PUBLICATION_FORBIDDEN');

  const notes = extractReleaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (!notes) throw Error('RELEASE_NOTES_MISSING add a ## ' + version + ' section to CHANGELOG.md');
  fs.writeFileSync(manifest, injectReleaseNotes(fs.readFileSync(manifest, 'utf8'), notes), 'utf8');
  const notesFile = path.join(os.tmpdir(), `naumi-release-notes-${version}.md`);
  fs.writeFileSync(notesFile, notes + '\n', 'utf8');

  const tag = 'v' + version;
  const ghArgs = ['--repo', REPO];
  const existing = capture('gh', ['release', 'view', tag, ...ghArgs]);
  const targetCommitish=argValue('--target');if(targetCommitish&&!/^[a-f0-9]{40}$/.test(targetCommitish))throw Error('RELEASE_TARGET_INVALID');
  for(const command of releaseCommands({existing:existing.ok,tag,notesFile,installer,manifest,prerelease:args.includes('--prerelease'),targetCommitish}))run('gh',command);
  const size = (fs.statSync(installer).size / 1024 / 1024).toFixed(1);
  console.log(`RELEASE ${tag} artifacts=Naumi-Setup-${version}-x64.exe(${size}MB)+latest.yml(with releaseNotes) feed=github:${REPO}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
