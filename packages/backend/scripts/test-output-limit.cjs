// Isolated sandbox probe: no submissions, scores or database rows are created.
const assert=require('node:assert/strict');
const {JudgeService}=require('../dist/src/judge/judge.service');
const judge=new JudgeService({get:(_key,fallback)=>process.env.GO_JUDGE_URL||fallback});
const files=new Set();
(async()=>{
  const compiled=await judge.compile('cpp','#include <cstdio>\nint main(){for(int i=0;i<6000000;i++) std::printf("%d ",i);return 0;}');
  assert(compiled.success,compiled.message);files.add(compiled.fileId);
  const result=await judge.run('cpp','',10000,256,compiled.fileId,'',{outputLimitMb:1024,cacheOutput:true});
  if(result.outputFileId) files.add(result.outputFileId);
  assert.equal(result.status,'ACCEPTED',JSON.stringify(result));
  assert(result.outputFileId);assert(result.output.length<33000);
  const checker='import sys, os\nn=0\nwhile True:\n b=sys.stdin.buffer.read(65536)\n if not b: break\n n+=len(b)\nprint(n==46888890 and os.path.getsize("user_output")==n)\n';
  const verdict=await judge.runWithFiles('python',{fileId:result.outputFileId},10000,256,undefined,checker,{user_output:{fileId:result.outputFileId}});
  assert.equal(verdict.status,'ACCEPTED',JSON.stringify(verdict));assert.equal(verdict.output.trim(),'True');
  const ole=await judge.run('cpp','',10000,256,compiled.fileId,'',{outputLimitMb:4,cacheOutput:true});
  if(ole.outputFileId) files.add(ole.outputFileId);
  assert.equal(ole.status,'OUTPUT_LIMIT_EXCEEDED',JSON.stringify(ole));
  const normal=await judge.run('python','',10000,256,undefined,'import sys\nsys.stdout.write("x"*12582912+"\\r\\n")',{outputLimitMb:64,cacheOutput:true});
  if(normal.outputFileId) files.add(normal.outputFileId);
  assert.equal(normal.status,'ACCEPTED',JSON.stringify(normal));
  assert.equal(await judge.compareCachedOutput(normal.outputFileId,'x'.repeat(12582912)+'\n'),true);
  assert.equal(await judge.compareCachedOutput(normal.outputFileId,'x'.repeat(12582911)+'y'),false);
  if (process.env.PROBE_LARGE_OUTPUT === '1') {
    const large=await judge.run('python','',30000,2048,undefined,'import sys\nfor i in range(1024): sys.stdout.buffer.write(b"x"*1048576)',{outputLimitMb:1024,cacheOutput:true});
    if(large.outputFileId) files.add(large.outputFileId);
    assert.equal(large.status,'ACCEPTED',JSON.stringify({...large,output:large.output.length}));
    const sizeChecker='import sys,os\nn=0\nwhile True:\n b=sys.stdin.buffer.read(65536)\n if not b:break\n n+=len(b)\nprint(n==1073741824 and os.path.getsize("user_output")==n)';
    const checked=await judge.runWithFiles('python',{fileId:large.outputFileId},30000,1024,undefined,sizeChecker,{user_output:{fileId:large.outputFileId}});
    assert.equal(checked.status,'ACCEPTED',JSON.stringify(checked));assert.equal(checked.output.trim(),'True');
    console.log(JSON.stringify({boundaryPass:true,outputBytes:1073741824,spj:checked.output.trim()}));
    await judge.deleteFile(large.outputFileId);files.delete(large.outputFileId);
    const over=await judge.run('python','',30000,2048,undefined,'import sys\nfor i in range(1024): sys.stdout.buffer.write(b"x"*1048576)\nsys.stdout.buffer.write(b"x")',{outputLimitMb:1024,cacheOutput:true});
    if(over.outputFileId)files.add(over.outputFileId);
    assert.equal(over.status,'OUTPUT_LIMIT_EXCEEDED',JSON.stringify({...over,output:over.output.length}));
    console.log(JSON.stringify({oneByteOverStatus:over.status}));
  }
  console.log(JSON.stringify({pass:true,numbers:6000000,outputBytes:46888890,configuredMiB:1024,previewChars:result.output.length,spj:verdict.output.trim(),lowerLimitStatus:ole.status,standardStream:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{for(const id of files) await judge.deleteFile(id);});
