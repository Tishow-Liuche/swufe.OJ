const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',done=new Set(),busy=false;

// ===== VISIBLE DEBUG BANNER (confirms content.js is injected) =====
let banner=document.createElement('div');
banner.id='oj-helper-banner';
banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a1a2e;color:#4fc3f7;padding:4px 16px;font-size:13px;font-family:monospace;text-align:center;pointer-events:none';
banner.textContent='🔌 OJ Helper v0.9 — 已注入 | 等待CF任务...';
document.documentElement.appendChild(banner);

// ===== TASK POLLING =====
setInterval(async()=>{
  if(busy)return;
  try{
    banner.textContent='🔌 OJ Helper v0.9 — 轮询中...';
    let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=v9');
    if(!r.ok){banner.textContent='⚠️ Helper — 后端未连接';return}
    let t=await r.json();
    if(!t||!t.taskId){banner.textContent='✅ Helper — 就绪，暂无CF任务';return}
    if(t.platform!=='CODEFORCES'||done.has(t.taskId)){banner.textContent='✅ Helper — 就绪';return}
    done.add(t.taskId);busy=true;
    banner.textContent='🚀 检测到CF任务: '+t.remoteProblemId+' | 正在提交...';
    await submitCF(t);
    busy=false;
  }catch(e){banner.textContent='❌ Helper: '+e.message;busy=false}
},4000);

async function submitCF(t){
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if(!m){busy=false;return}
  let cid=+m[1],pidx=m[2];

  try{
    // Step 1: Get CF submit page (extract CSRF + check login)
    banner.textContent='🚀 '+t.remoteProblemId+' | 正在获取CF CSRF...';
    let pageResp=await fetch('https://codeforces.com/problemset/submit/'+cid+'/'+pidx,{credentials:'include'});
    let html=await pageResp.text();
    let csrf=(html.match(/<meta name="X-Csrf-Token" content="([^"]+)"/)||[])[1];

    if(!csrf){
      banner.textContent='❌ CF 未登录 — 请在 codeforces.com 登录 Tishow__Liuche';
      post(t.submissionId,'REMOTE_ERROR',0,null,'CF登录过期，请在codeforces.com重新登录');
      return;
    }
    banner.textContent='🚀 '+t.remoteProblemId+' | CSRF: '+csrf.substring(0,15)+'... 提交中...';

    // Step 2: Submit via XHR (more reliable with cookies than fetch)
    let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[t.language]||'73';
    let ftaa=Array.from({length:18},()=>Math.floor(Math.random()*16).toString(16)).join('');
    let body=new URLSearchParams({csrf_token:csrf,ftaa,bfaa:'f1b3f18c715565b589b7823cda7448ce',action:'submitSolutionFormSubmitted',submittedProblemIndex:pidx,programTypeId:pt,source:t.sourceCode,tabSize:'4',sourceFile:'',_tta:'594'});

    // Use XHR instead of fetch (better cookie handling in content scripts)
    let submitResult=await new Promise((resolve,reject)=>{
      let xhr=new XMLHttpRequest();
      xhr.open('POST','https://codeforces.com/problemset/submit/'+cid+'/'+pidx+'?csrf_token='+encodeURIComponent(csrf),true);
      xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
      xhr.withCredentials=true;
      xhr.onload=()=>resolve(xhr.responseText);
      xhr.onerror=()=>reject(new Error('XHR error'));
      xhr.send(body.toString());
    });

    // Step 3: Extract SID from response
    let sid=null;
    let sm1=submitResult.match(/data-submission-id="(\d+)"/);
    if(sm1)sid=+sm1[1];
    let sm2=submitResult.match(/\/status\/(\d+)\/my/);
    if(!sid&&sm2)sid=+sm2[1];

    // Fallback: API reconciliation
    if(!sid){
      banner.textContent='🚀 '+t.remoteProblemId+' | 已提交，正在对账...';
      await sleep(6000);
      let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
      let ad=await ar.json();
      if(ad.status==='OK'){
        let match=(ad.result||[]).find(s=>s.problem?.contestId===cid&&s.problem?.index===pidx&&(Date.now()/1000-s.creationTimeSeconds)<180);
        if(match)sid=match.id;
      }
    }

    if(!sid){
      banner.textContent='❌ '+t.remoteProblemId+' | 提交失败：无法获取CF Submission ID';
      post(t.submissionId,'REMOTE_ERROR',0,null,'已发出提交但未获取到CF Submission ID');
      return;
    }

    banner.textContent='📊 '+t.remoteProblemId+' | CF SID:'+sid+' | 等待评测...';
    post(t.submissionId,'JUDGING',0,sid);

    // Step 4: Poll CF API for verdict
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
          banner.textContent='✅ '+t.remoteProblemId+' | '+sv+' ('+(sub.timeConsumedMillis||0)+'ms)';
          post(t.submissionId,sv,sv==='ACCEPTED'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);
          return;
        }
      }catch(e){}
    }
    banner.textContent='⏳ '+t.remoteProblemId+' | 评测超时';
  }catch(e){
    banner.textContent='❌ '+t.remoteProblemId+' | '+e.message;
    post(t.submissionId,'REMOTE_ERROR',0,null,'CF提交异常: '+e.message);
  }
}

async function post(sid,status,score,cfid,msg,time,mem){
  await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
