// Uses an isolated temporary schema; never enrolls users in real contests.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { importContestParticipants } = require(process.env.IMPORT_TEST_MODULE || '../dist/src/contest/participant-import.js');
async function main() {
  if (process.env.ALLOW_ISOLATED_IMPORT_TEST !== '1') throw new Error('Set ALLOW_ISOLATED_IMPORT_TEST=1 explicitly');
  const schema = 'import_test_' + randomUUID().replaceAll('-', '');
  const admin = new PrismaClient();
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
  const db = new PrismaClient({datasources:{db:{url:url.toString()}}});
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    for (const table of ['User','Contest','ContestParticipant']) {
      await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    }
    await db.user.createMany({data:[
      {id:'u1',username:'alice',email:'alice@example.invalid',password:'not-a-login',studentId:'00123'},
      {id:'u2',username:'bob',email:'bob@example.invalid',password:'not-a-login',studentId:'00456'},
      {id:'deleted',username:'deleted',email:'deleted@example.invalid',password:'not-a-login',deletedAt:new Date()},
    ]});
    let number=0;
    const actor={id:'test-admin',role:'ADMIN'};
    const run=(id,rows,who=actor)=>importContestParticipants(db,id,who,{rows});
    for(const mode of ['ACM','IOI']) for(const visibility of ['PUBLIC','PRIVATE','PASSWORD','CAMPUS_PRIVATE']) for(const teamMode of [false,true]) {
      const id='c'+(++number);
      await db.contest.create({data:{id,contestNo:number,title:'isolated test',mode,visibility,teamMode,createdBy:'test-admin',startTime:new Date(0),registerEnd:new Date(0),endTime:new Date(Date.now()+600000)}});
      const results=await Promise.all([run(id,[{username:'alice',realName:'Test Student'}]),run(id,[{studentId:'00123',realName:'Test Student'}])]);
      assert.equal(results.reduce((n,r)=>n+r.imported,0),1);
      assert.equal(results.reduce((n,r)=>n+r.skipped,0),1);
      assert.equal(await db.contestParticipant.count({where:{contestId:id}}),1);
      const original=await db.contestParticipant.findFirst({where:{contestId:id}});
      assert.equal((await run(id,[{username:'alice'}])).skipped,1);
      assert.deepEqual(await db.contestParticipant.findFirst({where:{contestId:id}}),original);
      await assert.rejects(run(id,[{username:'bob'}],{id:'owner',role:'TEACHER'}));
      assert.equal((await run(id,[{username:'deleted'}])).invalid,1);
      if(visibility==='CAMPUS_PRIVATE'){
        assert.equal((await run(id,[{username:'bob'}])).invalid,1);
        assert.equal((await run(id,[{username:'bob',studentId:'00123',realName:'Test'}])).invalid,1);
      }
    }
    await db.contestParticipant.updateMany({where:{contestId:'c1'},data:{isVirtual:true,virtualStart:new Date(1000),virtualEnd:new Date(2000)}});
    const before=await db.contestParticipant.findFirst({where:{contestId:'c1'}});
    await run('c1',[{username:'alice'}]);assert.deepEqual(await db.contestParticipant.findFirst({where:{contestId:'c1'}}),before);
    await db.contest.update({where:{id:'c1'},data:{endTime:new Date(0)}});
    await assert.rejects(run('c1',[{username:'bob'}]));
    console.log('PASS: 16 contest combinations, concurrent retry, identity, role, deleted users, virtual preservation, ended contest');
  } finally {
    await db.$disconnect();
    if(created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    console.log('Isolated test schema cleaned');
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
