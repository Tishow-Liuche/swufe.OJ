console.log('[CF-Helper v1.0] Content script loaded on',location.href);
const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',D=new Set(),B=false;

setInterval(async()=>{
 if(B)return;
 try{
  let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=v10');
  if(!r.ok)return;
  let t=await r.json();
  if(!t||!t.taskId||t.platform!=='CODEFORCES'||D.has(t.taskId))return;
  D.add(t.taskId);B=true;
  console.log('[CF-Helper] Processing',t.remoteProblemId,t.submissionId);
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if(!m){B=false;return}
  let cid=+m[1],pidx=m[2];

  try{
   // Get CSRF
   let p=await fetch('https://codeforces.com/problemset/submit/'+cid+'/'+pidx);
   let csrf=(await p.text()).match(/<meta name="X-Csrf-Token" content="([^"]+)"/);
   if(!csrf){console.log('[CF-Helper] No CSRF — not logged in');P(t.submissionId,'REMOTE_ERROR','CF未登录');B=false;return}
   csrf=csrf[1];console.log('[CF-Helper] CSRF OK');

   // Submit
   let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[t.language]||'73';
   let f=Array.from({length:18},()=>Math.floor(Math.random()*16).toString(16)).join('');
   let bd=new URLSearchParams({csrf_token:csrf,ftaa:f,bfaa:'f1b3f18c715565b589b7823cda7448ce',action:'submitSolutionFormSubmitted',submittedProblemIndex:pidx,programTypeId:pt,source:t.sourceCode,tabSize:'4',sourceFile:'',_tta:'594'});
   let resp=await fetch('https://codeforces.com/problemset/submit/'+cid+'/'+pidx+'?csrf_token='+encodeURIComponent(csrf),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:bd.toString()});
   let txt=await resp.text();
   console.log('[CF-Helper] Submitted, resp:',txt.length,'bytes');

   // Extract/Reconcile SID
   let sid=null;
   let m1=txt.match(/data-submission-id="(\d+)"/);if(m1)sid=+m1[1];
   let m2=txt.match(/\/status\/(\d+)\/my/);if(!sid&&m2)sid=+m2[1];
   if(!sid){
    console.log('[CF-Helper] No direct SID, reconciling...');
    await Z(6000);
    let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
    let ad=await ar.json();
    if(ad.status==='OK'){let x=(ad.result||[]).find(s=>s.problem?.contestId===cid&&s.problem?.index===pidx&&(Date.now()/1000-s.creationTimeSeconds)<180);if(x)sid=x.id}
   }
   if(!sid){console.log('[CF-Helper] No SID');P(t.submissionId,'REMOTE_ERROR','无法获取CF SID');B=false;return}
   console.log('[CF-Helper] SID:',sid);
   P(t.submissionId,'JUDGING',sid);

   // Poll verdict
   for(let i=0;i<30;i++){
    await Z(3000);
    try{
     let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
     let ad=await ar.json();
     if(ad.status!=='OK')continue;
     let sub=(ad.result||[]).find(x=>x.id===sid);
     if(sub&&sub.verdict&&sub.verdict!=='TESTING'){
      let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
      let sv=vm[sub.verdict]||sub.verdict;
      console.log('[CF-Helper] VERDICT:',sv,sub.timeConsumedMillis+'ms');
      P(t.submissionId,sv,sv==='ACCEPTED'?100:sid,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);
      B=false;return;
     }
    }catch(e){}
   }
   console.log('[CF-Helper] Poll timeout');
  }catch(e){console.error('[CF-Helper]',e.message);P(t.submissionId,'REMOTE_ERROR',e.message)}
  B=false;
 }catch(e){/*network*/}
},4000);

async function P(sid,status,score,cfid,msg,time,mem){
 await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid):'N/A',userId:U,compileMessage:msg||'',timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
function Z(ms){return new Promise(r=>setTimeout(r,ms))}
