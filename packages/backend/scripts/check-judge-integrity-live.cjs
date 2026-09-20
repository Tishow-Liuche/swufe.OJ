if (process.env.JUDGE_INTEGRITY_AUDIT !== '1') throw new Error('Set JUDGE_INTEGRITY_AUDIT=1 only in an authorized environment; this test creates and deletes isolated fixtures.');
const {PrismaClient}=require('@prisma/client');
const {Queue}=require('bullmq');
const {randomBytes,randomInt}=require('node:crypto');
const fs=require('node:fs');
const db=new PrismaClient();
const queue=new Queue('judge',{connection:{host:process.env.REDIS_HOST,port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD}});
const nonce=randomBytes(6).toString('hex'), jobs=[], problems=[];
let user;
const bool='import sys\nfrom pathlib import Path\na,b=map(int,Path("input").read_text().split())\nprint(sys.stdin.read().strip()==str(a+b))';
const cases=[
 {name:'standard-python-ac',code:'print(sum(map(int,input().split())))',expect:'ACCEPTED'},
 {name:'standard-wrong',code:'print(99)',expect:'WRONG_ANSWER'},
 {name:'standard-empty',code:'pass',expect:'WRONG_ANSWER'},
 {name:'standard-extra-token',code:'print("3 extra")',expect:'WRONG_ANSWER'},
 {name:'standard-crash',code:'raise RuntimeError("audit")',expect:'RUNTIME_ERROR'},
 {name:'standard-timeout',code:'while True: pass',time:100,expect:'TIME_LIMIT_EXCEEDED'},
 {name:'standard-memory',code:'x=bytearray(256*1024*1024)',memory:32,expect:'MEMORY_LIMIT_EXCEEDED'},
 {name:'standard-output-limit',code:'print("x"*(11*1024*1024))',expect:'OUTPUT_LIMIT_EXCEEDED'},
 {name:'cpp-ac',language:'cpp',code:'#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}',expect:'ACCEPTED'},
 {name:'cpp-compile-error',language:'cpp',code:'this cannot compile',expect:'COMPILE_ERROR'},
 {name:'c-ac',language:'c',code:'#include <stdio.h>\nint main(){int a,b;scanf("%d%d",&a,&b);printf("%d",a+b);}',expect:'ACCEPTED'},
 {name:'java-ac',language:'java',code:'import java.util.*; public class Main {public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}',expect:'ACCEPTED'},
 {name:'spj-boolean-ac',checker:bool,code:'print(3)',expect:'ACCEPTED'},
 {name:'spj-boolean-wa',checker:bool,code:'print(99)',expect:'WRONG_ANSWER'},
 {name:'spj-empty-candidate',checker:bool,code:'pass',expect:'WRONG_ANSWER'},
 {name:'spj-file-integrity',checker:'import sys\nfrom pathlib import Path\nprint(Path("input").read_text()=="1 2\\n" and Path("output").read_text()=="3\\n" and Path("user_output").read_text()==sys.stdin.read()=="3\\n")',code:'print(3)',expect:'ACCEPTED'},
 {name:'spj-exit-wa',protocol:'EXIT_CODE',checker:'import sys\nsys.exit(1)',code:'print(3)',expect:'WRONG_ANSWER'},
 {name:'spj-exit-ac',protocol:'EXIT_CODE',checker:'pass',code:'print(3)',expect:'ACCEPTED'},
 {name:'spj-exit-two-wa',protocol:'EXIT_CODE',checker:'import sys\nsys.exit(2)',code:'print(3)',expect:'WRONG_ANSWER'},
 {name:'spj-exit-three-error',protocol:'EXIT_CODE',checker:'import sys\nsys.exit(3)',code:'print(3)',expect:'SYSTEM_ERROR'},
 {name:'spj-invalid-verdict',checker:'print("maybe")',code:'print(3)',expect:'SYSTEM_ERROR'},
 {name:'spj-signal',checker:'import os,signal\nos.kill(os.getpid(),signal.SIGKILL)',code:'print(3)',expect:'SYSTEM_ERROR'},
 {name:'spj-legacy-compatibility',protocol:'LEGACY',checker:'pass',code:'print(99)',expect:'ACCEPTED',note:'Compatibility only: does not prove candidate correctness'},
 {name:'spj-crash',checker:'raise RuntimeError("broken checker")',code:'print(3)',expect:'SYSTEM_ERROR'},
 {name:'spj-timeout',checker:'while True: pass',code:'print(3)',time:100,expect:'SYSTEM_ERROR'},
 {name:'spj-no-verdict',checker:'pass',code:'print(99)',expect:'SYSTEM_ERROR',note:'Ambiguous with supported legacy zero-exit checker; explicit protocol needed'},
 {name:'version-pinning',code:'print(3)',newVersion:true,expect:'ACCEPTED'},
 {name:'standard-multi-case',code:'print(3)',inputs:['1 2\n','2 2\n'],outputs:['3\n','4\n'],expect:'WRONG_ANSWER'},
 {name:'missing-test-data',code:'print(3)',inputs:[],outputs:[],expect:'SYSTEM_ERROR'},
 {name:'version-time-limit',code:'import time\nstart=time.process_time()\nwhile time.process_time()-start<0.4: pass\nprint(3)',time:100,snapshotTime:1000,expect:'ACCEPTED'},
 {name:'timeout-stops-following-cases',code:'while True: pass',time:100,inputs:['1 2\n','2 2\n'],outputs:['3\n','4\n'],expect:'TIME_LIMIT_EXCEEDED',caseCount:1},
 {name:'checker-error-overrides-earlier-wa',checker:'from pathlib import Path\nif Path("input").read_text().startswith("2"): raise RuntimeError("checker fault")\nprint(False)',code:'print(99)',inputs:['1 2\n','2 2\n'],outputs:['3\n','4\n'],expect:'SYSTEM_ERROR',caseCount:2},
 {name:'spj-output-limit',checker:'print("x"*(11*1024*1024))',code:'print(3)',expect:'SYSTEM_ERROR'},
];
const report=[];
(async()=>{
 if((await queue.getWorkers()).length===0)throw Error('No live worker');
 user=await db.user.create({data:{username:'judgeaudit_'+nonce,email:nonce+'@example.invalid',password:'disabled-audit-account',role:'STUDENT'}});
 try {
  for(const c of cases){
   const problem=await db.problem.create({data:{title:'Isolated judge audit '+c.name,problemNo:-randomInt(100000000,999999999),status:'CONTEST_RESERVED',versions:{create:{description:'Isolated diagnostic fixture',checker:{create:{type:c.checker?'SPJ':'STANDARD',protocol:c.protocol||'BOOLEAN_STDOUT',language:c.checker?'python':null,sourceCode:c.checker||null}},testCases:{create:(c.inputs||['1 2\n']).map((input,i)=>({input,expectedOutput:(c.outputs||['3\n'])[i],order:i,score:10}))}}}},include:{versions:true}});
   problems.push(problem.id);
   const version=problem.versions[0];
   if(c.snapshotTime)await db.problemVersion.update({where:{id:version.id},data:{timeLimit:c.snapshotTime,memoryLimit:256}});
   if(c.newVersion){await db.problemVersion.update({where:{id:version.id},data:{isCurrent:false}});await db.problemVersion.create({data:{problemId:problem.id,version:2,description:'Changed after submission snapshot',testCases:{create:{input:'1 2\n',expectedOutput:'99\n',score:10}}}});}
   const s=await db.submission.create({data:{userId:user.id,problemId:problem.id,problemVersionId:version.id,language:c.language||'python',sourceCode:c.code,status:'QUEUING',judgeTask:{create:{}}}});
   const job=await queue.add('local-judge',{submissionId:s.id,problemId:problem.id,language:s.language,sourceCode:c.code,timeLimit:c.time||1000,memoryLimit:c.memory||256},{attempts:1});jobs.push(job);
   const deadline=Date.now()+120000;let state;
   while(Date.now()<deadline){state=await job.getState();if(state==='completed'||state==='failed')break;await new Promise(r=>setTimeout(r,1000));}
   if(state!=='completed'&&state!=='failed')throw Error('Audit job not finished; keep fixtures for safe cleanup: '+s.id);
   const result=await db.submission.findUnique({where:{id:s.id},include:{cases:{orderBy:{caseIndex:'asc'}},judgeTask:true}});
   const expectedScore=c.name==='standard-multi-case'?50:c.expect==='ACCEPTED'?100:0;
   const row={name:c.name,expected:c.expect,actual:result.status,pass:result.status===c.expect&&result.score===expectedScore&&!!result.judgeTask?.finishedAt&&(c.caseCount===undefined||c.caseCount===result.cases.length),score:result.score,timeMs:result.timeUsed,memoryKb:result.memoryUsed,cases:result.cases.map(x=>x.status),taskFinished:!!result.judgeTask?.finishedAt,note:c.note};
   report.push(row);console.log(JSON.stringify(row));
  }
 } finally {
  const active=[];for(const job of jobs){if(await job.getState()==='active')active.push(job.id);}
  if(active.length) console.log('Active audit jobs retained; no unsafe cleanup: '+active.join(','));
  else {for(const job of jobs)await job.remove();await db.submission.deleteMany({where:{userId:user.id}});await db.problem.deleteMany({where:{id:{in:problems}}});await db.user.delete({where:{id:user.id}});console.log('All audit fixtures removed');}
  fs.writeFileSync('/tmp/judge-audit-report.json',JSON.stringify(report,null,2));
 }
 if(report.some(row=>!row.pass))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await db.$disconnect();await queue.close()});
