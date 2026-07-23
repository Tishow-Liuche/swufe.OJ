import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), 'utf8');
}

function assertFile(relativePath) {
  const fullPath = path.resolve(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
  return read(relativePath);
}

function assertMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

function assertNoMatch(source, pattern, message) {
  if (pattern.test(source)) {
    throw new Error(message);
  }
}

const helpers = [
  {
    label: 'Codeforces',
    file: 'public/cf-helper.user.js',
    expectedName: 'SWUFE Singularity OJ - Codeforces Auto Submit Helper',
    lookupApi: /\/api\/cf-submit-helper\/lookup/,
    reportApi: /\/api\/cf-submit-helper\/[\s\S]*\/report-sid/,
    codeFill: /setSourceCode\s*\([^)]*sourceCode|\.setValue\s*\([^)]*sourceCode/s,
    autoSubmit: /bn\.click\s*\(\)|form\.submit\s*\(\)/,
    closeAfterReport: /window\.close\s*\(\)/
  },
  {
    label: 'Luogu',
    file: 'public/luogu-helper.user.js',
    expectedName: 'SWUFE Singularity OJ - Luogu Auto Submit Helper',
    lookupApi: /\/api\/luogu-submit-helper\/lookup/,
    reportApi: /\/api\/luogu-submit-helper\/[\s\S]*\/report-result/,
    codeFill: /setCode\s*\([^)]*sourceCode|models\[i\]\.setValue\s*\(code\)/s,
    autoSubmit: /button\.click\s*\(\)/,
    closeAfterReport: /window\.close\s*\(\)/
  },
  {
    label: 'QOJ',
    file: 'public/qoj-helper.user.js',
    expectedName: 'SWUFE Singularity OJ - QOJ Auto Submit Helper',
    lookupApi: /\/api\/qoj-submit-helper\/lookup/,
    reportApi: /\/api\/qoj-submit-helper\/[\s\S]*\/report-result/,
    codeFill: /setCode\s*\([^)]*sourceCode|editor\.setValue\s*\(code/s,
    autoSubmit: /submitWithBottomButton\s*\(|clickElement\s*\(button\)/,
    closeAfterReport: /window\.close\s*\(\)/
  }
];

const installer = assertFile('public/install-oj-helpers.html');
const problemDetail = assertFile('src/views/ProblemDetail.vue');

assertMatch(installer, /SWUFE Singularity OJ One-Click Installer/, 'Unified installer title is missing');
assertMatch(installer, /cf-helper\.user\.js/, 'Unified installer must link Codeforces helper');
assertMatch(installer, /luogu-helper\.user\.js/, 'Unified installer must link Luogu helper');
assertMatch(installer, /qoj-helper\.user\.js/, 'Unified installer must link QOJ helper');
assertMatch(installer, /openAllHelpers/, 'Unified installer must expose one-click open-all install action');
assertMatch(problemDetail, /withSwufeOjApiParam/, 'ProblemDetail must append SWUFE OJ API base to external submit URLs');
assertMatch(problemDetail, /swufeOjApi/, 'External submit URLs must carry swufeOjApi for deployed server callbacks');

for (const helper of helpers) {
  const source = assertFile(helper.file);
  assertMatch(source, new RegExp(`@name\\s+${helper.expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${helper.label} helper has wrong Tampermonkey name`);
  assertNoMatch(source, /@(?:downloadURL|updateURL)\s+http:\/\/localhost:5173/i, `${helper.label} helper still points Tampermonkey updates to localhost`);
  assertMatch(source, /@connect\s+\*/, `${helper.label} helper must allow the deployed SWUFE OJ API host`);
  assertMatch(source, /swufeOjApi/, `${helper.label} helper does not read deployed SWUFE OJ API base from external submit URL`);
  assertMatch(source, /swufe_oj_api_base/, `${helper.label} helper does not persist deployed SWUFE OJ API base`);
  assertMatch(source, helper.lookupApi, `${helper.label} helper does not fetch pending OJ task`);
  assertMatch(source, helper.reportApi, `${helper.label} helper does not report result/SID back to OJ`);
  assertMatch(source, helper.codeFill, `${helper.label} helper does not contain code insertion logic`);
  assertMatch(source, helper.autoSubmit, `${helper.label} helper does not contain automatic submit click logic`);
  assertMatch(source, helper.closeAfterReport, `${helper.label} helper does not close helper tab after reporting`);
}

console.log('SWUFE OJ helper installer checks passed');
