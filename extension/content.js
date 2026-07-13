const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',done=new Set(),busy=false;
let log=msg=>console.log('[OJ-H]'+msg);

log('Content script loaded. Starting CF task poller...');

setInterval(async()=>{
  if(busy)return;
  try{
    let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=v9');
    if(!r.ok)return;
    let t=await r.json();
    if(!t||!t.taskId||t.platform!=='CODEFORCES'||done.has(t.taskId))return;
    done.add(t.taskId);busy=true;
    log('CF task found: '+t.remoteProblemId+' sub='+t.submissionId);
    await submitCF(t);
    busy=false;
  }catch(e){log('Poll error: '+e.message);busy=false}
},4000);

async function submitCF(t){
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if(!m){busy=false;return}
  let cid=+m[1],pidx=m[2];

  try{
    // Step 1: Get CSRF from CF submit page
    log('Step1: Getting CF CSRF for '+cid+pidx);
    let pageResp=await fetch('https://codeforces.com/problemset/submit/'+cid+'/'+pidx,{credentials:'include'});
    let html=await pageResp.text();
    let csrf=(html.match(/<meta name="X-Csrf-Token" content="([^"]+)"/)||[])[1];

    if(!csrf){
      log('FAIL: No CSRF — CF not logged in');
      post(t.submissionId,'REMOTE_ERROR',0,null,'CF未登录，请在 codeforces.com 登录账号 Tishow__Liuche 后重新提交');
      return;
    }
    log('CSRF OK: '+csrf.substring(0,20)+'...');

    // Step 2: Submit code via XHR
    log('Step2: Submitting code...');
    let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[t.language]||'73';
    let ftaa=Array.from({length:18},()=>Math.floor(Math.random()*16).toString(16)).join('');
    let body=new URLSearchParams({csrf_token:csrf,ftaa,bfaa:'f1b3f18c715565b589b7823cda7448ce',action:'submitSolutionFormSubmitted',submittedProblemIndex:pidx,programTypeId:pt,source:t.sourceCode,tabSize:'4',sourceFile:'',_tta:'594'});

    let xhrResult=await new Promise((resolve,reject)=>{
      let xhr=new XMLHttpRequest();
      xhr.open('POST','https://codeforces.com/problemset/submit/'+cid+'/'+pidx+'?csrf_token='+encodeURIComponent(csrf),true);
      xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
      xhr.withCredentials=true;
      xhr.onload=()=>resolve(xhr.responseText);
      xhr.onerror=()=>reject(new Error('XHR fail'));
      xhr.ontimeout=()=>reject(new Error('XHR timeout'));
      xhr.timeout=15000;
      xhr.send(body.toString());
    });

    log('XHR response: '+xhrResult.length+' bytes');

    // Step 3: Extract SID
    let sid=null;
    let m1=xhrResult.match(/data-submission-id="(\d+)"/);
    if(m1)sid=+m1[1];
    let m2=xhrResult.match(/\/status\/(\d+)\/my/);
    if(!sid&&m2)sid=+m2[1];

    // API reconciliation fallback
    if(!sid){
      log('No direct SID, reconciling via API...');
      await sleep(6000);
      let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
      let ad=await ar.json();
      if(ad.status==='OK'){
        let match=(ad.result||[]).find(s=>s.problem?.contestId===cid&&s.problem?.index===pidx&&(Date.now()/1000-s.creationTimeSeconds)<180);
        if(match)sid=match.id;
      }
    }

    if(!sid){log('FAIL: No SID');post(t.submissionId,'REMOTE_ERROR',0,null,'已提交但无法获取CF Submission ID');return}
    log('CF SID: '+sid);

    post(t.submissionId,'JUDGING',0,sid);

    // Step 4: Poll CF API for verdict
    log('Polling CF verdict for '+sid+'...');
    for(let i=0;i<30;i++){
      await sleep(3000);
      try{
        let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
        let ad=await ar.json();
        if(ad.status!=='OK')continue;
        let sub=(ad.result||[]).find(x=>x.id===sid);
        if(sub&&sub.verdict&&sub.verdict!=='TESTING'){
          let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
          let sv=vm[sub.verdict]||sub.verdict;
          log('VERDICT: '+sv+' '+sub.timeConsumedMillis+'ms');
          post(t.submissionId,sv,sv==='ACCEPTED'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);
          return;
        }
      }catch(e){}
    }
    log('Verdict poll timeout');
  }catch(e){log('ERROR: '+e.message);post(t.submissionId,'REMOTE_ERROR',0,null,'CF提交异常:'+e.message)}
}

async function post(sid,status,score,cfid,msg,time,mem){
  await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
