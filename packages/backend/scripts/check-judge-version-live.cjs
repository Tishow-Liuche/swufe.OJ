if (process.env.JUDGE_INTEGRITY_AUDIT !== '1') throw new Error('Set JUDGE_INTEGRITY_AUDIT=1 only in an authorized environment; this test creates and deletes isolated fixtures.');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const AdmZip=require('adm-zip');
const {ProblemService}=require('../dist/src/problem/problem.service');
const {randomBytes,randomInt}=require('node:crypto');
const db=new PrismaClient();
const service=new ProblemService(db,{}, {assertCanManage:async()=>{}});
const nonce=randomBytes(6).toString('hex');
let user,problem;
function zip(input,output){const z=new AdmZip();z.addFile('1.in',Buffer.from(input));if(output!==undefined)z.addFile('1.out',Buffer.from(output));return {originalname:'data.zip',buffer:z.toBuffer(),size:z.toBuffer().length};}
async function versions(){return db.problemVersion.findMany({where:{problemId:problem.id},orderBy:{version:'asc'},include:{checker:true,testCases:true,testGroups:true}});}
(async()=>{
 try{
  user=await db.user.create({data:{username:'versionaudit_'+nonce,email:nonce+'@example.invalid',password:'disabled',role:'TEACHER'}});
  const actor={id:user.id,role:'TEACHER'};
  problem=await db.problem.create({data:{title:'Isolated version audit '+nonce,problemNo:-randomInt(100000000,999999999),createdById:user.id,source:'LOCAL',status:'DRAFT',versions:{create:{version:1,timeLimit:1000,memoryLimit:256,description:'original',checker:{create:{type:'STANDARD'}},testCases:{create:{input:'1 2\n',expectedOutput:'3\n',order:0,score:100}}}}}});
  const before=await versions();
  await service.uploadTestData(problem.id,zip('2 2\n','4\n'),actor);
  let v=await versions();assert.equal(v.length,2);assert.deepEqual(v[0].testCases,before[0].testCases);assert.equal(v[1].testCases[0].expectedOutput,'4\n');
  console.log('PASS immutable upload');
  await Promise.all([service.update(problem.id,{description:'concurrent statement'},actor),service.uploadTestData(problem.id,zip('3 3\n','6\n'),actor)]);
  v=await versions();assert.deepEqual(v.map(x=>x.version),[1,2,3,4]);assert.equal(v.filter(x=>x.isCurrent).length,1);assert.equal(v[3].description,'concurrent statement');assert.equal(v[3].testCases[0].expectedOutput,'6\n');
  console.log('PASS concurrent publication serialization');
  await assert.rejects(service.uploadTestData(problem.id,zip('invalid no output'),actor));assert.deepEqual(await versions(),v);
  console.log('PASS invalid ZIP rollback');
  await service.update(problem.id,{judgeMode:'SPJ',spjLanguage:'python',spjSourceCode:'print(True)',spjProtocol:'BOOLEAN_STDOUT',timeLimit:2345,memoryLimit:128},actor);
  await service.uploadChecker(problem.id,{originalname:'checker.py',buffer:Buffer.from('print(False)')},'SPJ','python',actor,'BOOLEAN_STDOUT');
  v=await versions();assert.equal(v.at(-1).checker.sourceCode,'print(False)');assert.equal(v.at(-1).checker.protocol,'BOOLEAN_STDOUT');assert.equal(v.at(-1).timeLimit,2345);assert.equal(v.at(-1).memoryLimit,128);
  console.log('PASS source bytes, protocol and limit snapshot');
  await service.uploadTestData(problem.id,zip('1 2\n'),actor);
  await service.updateStatus(problem.id,'CONTEST_RESERVED',actor);
  await assert.rejects(service.update(problem.id,{judgeMode:'STANDARD'},actor),/草稿/);
  v=await versions();
  await service.update(problem.id,{judgeMode:'STANDARD',status:'DRAFT'},actor);
  const after=await versions();assert.equal(after.at(-1).testCases.length,0);assert.deepEqual(after.at(-2).testCases,v.at(-1).testCases);
  await assert.rejects(service.updateStatus(problem.id,'PUBLISHED',actor),/测试数据/);
  console.log('PASS SPJ mode change safety and publication guard');
 }finally{
  if(problem)await db.problem.delete({where:{id:problem.id}});
  if(user)await db.user.delete({where:{id:user.id}});
  console.log('All version audit fixtures removed');
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
