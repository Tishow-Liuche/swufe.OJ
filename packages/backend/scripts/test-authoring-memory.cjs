// Run only against a test database or an explicitly authorized isolated schema.
// Copies schema structure, never modifies production problem rows.
const { PrismaClient } = require('@prisma/client');
const { ProblemService } = require('../dist/src/problem/problem.service');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const {createHash} = require('node:crypto');
const {streamTestDataEntry} = require('../dist/src/problem/test-data-zip');
const schema = 'oj_memory_probe_' + Date.now();
const admin = new PrismaClient();
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const service = new ProblemService(db, {}, { assertCanManage: async () => ({id:'probe'}) });
const actor = {id:'probe',role:'ADMIN'};
const inputPath = process.env.MEMORY_FIXTURE;
if (!inputPath) throw Error('MEMORY_FIXTURE required');
let peak = 0;
const meter = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 10);
const file = path => ({ path, originalname:'data.zip',size:fs.statSync(path).size });
async function signatures(versionId) {
  return db.$queryRaw`SELECT "order", md5(input) AS input, md5("expectedOutput") AS output, octet_length(input) AS bytes FROM "ProblemTestCase" WHERE "problemVersionId"=${versionId} ORDER BY "order"`;
}
(async()=>{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const name of ['Problem','ProblemVersion','ProblemTestCase','Checker','TestGroup','ProblemTag','ProblemSource']) {
    await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${name}" (LIKE public."${name}" INCLUDING ALL)`);
  }
  const mode = process.env.PROBE_JUDGE_MODE || 'STANDARD';
  assert(['STANDARD','SPJ'].includes(mode));
  await db.problem.create({data:{id:'probe',problemNo:1,title:'isolated memory probe',source:'LOCAL',status:'DRAFT',versions:{create:{id:'v1',version:1,description:'original',checker:{create:{type:mode}}}}}});
  const imported = await service.uploadTestData('probe',file(inputPath),actor);
  const before = await signatures(imported.versionId);
  assert(before.length > 0);
  const zip = new AdmZip(inputPath);
  const inputs = zip.getEntries().filter(e=>/\d+\.in$/i.test(e.entryName)).sort((a,b)=>Number(a.entryName.match(/(\d+)\.in$/i)[1])-Number(b.entryName.match(/(\d+)\.in$/i)[1]));
  assert.equal(before.length, inputs.length);
  for(let i=0;i<inputs.length;i++) {
    for(const [field,entry] of [['input',inputs[i]],['output',zip.getEntry(inputs[i].entryName.replace(/\.in$/i,'.out')) || zip.getEntry(inputs[i].entryName.replace(/\.in$/i,'.ans'))]]) {
      const hash=createHash('md5');
      if(entry) for await(const chunk of streamTestDataEntry(entry,64*1024*1024)) hash.update(chunk);
      assert.equal(before[i][field],hash.digest('hex'),'stored bytes must match archive '+field);
    }
  }
  for (let i=0;i<3;i++) {
    await service.update('probe',{description:`edited ${i}`},actor);
    const detail = await service.findManageable('probe',actor);
    assert(JSON.stringify(detail).length < 65536, 'editor response must remain small');
    assert.equal(detail.versions[0].description,`edited ${i}`);
    assert.deepEqual(await signatures(detail.versions[0].id),before);
  }
  assert.deepEqual(await signatures(imported.versionId),before,'old version preserved');
  const second = await service.uploadTestData('probe',file(inputPath),actor);
  assert.deepEqual(await signatures(second.versionId),before,'replacement bytes unchanged');
  if (process.env.CORRUPT_FIXTURE) {
    const count = await db.problemVersion.count();
    await assert.rejects(service.uploadTestData('probe',file(process.env.CORRUPT_FIXTURE),actor));
    assert.equal(await db.problemVersion.count(),count,'failed import rolled back');
    assert.equal((await db.problemVersion.findFirst({where:{isCurrent:true}})).id,second.versionId);
  }
  console.log(JSON.stringify({pass:true,mode,testCases:before.length,inputBytes:before.reduce((n,x)=>n+x.bytes,0),peakRssMiB:Math.ceil(peak/1048576),editorBytes:JSON.stringify(await service.findManageable('probe',actor)).length}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{
  clearInterval(meter);await db.$disconnect();
  if(!/^oj_memory_probe_\d+$/.test(schema)) throw Error('unsafe cleanup target');
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});
