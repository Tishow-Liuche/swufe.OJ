/**
 * CF 页面 content script — 自动填表提交
 */
const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';

(async function init(){
  if(!location.href.includes('/problemset/submit/'))return;

  console.log('[CF-Inject] On submit page');

  // Read pending task from extension storage
  let data=await chrome.storage.local.get(['cf_pending_task']);
  if(!data.cf_pending_task)return console.log('[CF-Inject] No pending task');
  await chrome.storage.local.remove('cf_pending_task');

  let t=data.cf_pending_task;
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if(!m)return;
  let cid=+m[1],pidx=m[2];
  console.log('[CF-Inject] Submitting CF'+cid+pidx);

  let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[t.language]||'73';

  // Wait for form
  function attempt(n){
    let sel=document.querySelector('select[name="programTypeId"]');
    let area=document.querySelector('textarea[name="source"]');
    let btn=document.querySelector('input.submit[type="submit"]');
    if(!sel||!area||!btn){
      if(n<50)return setTimeout(()=>attempt(n+1),1000);
      console.log('[CF-Inject] Form timeout');
      post(t.submissionId,'REMOTE_ERROR',0,null,'CF 表单加载超时');
      return;
    }
    console.log('[CF-Inject] Form found, filling...');
    sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
    area.value=t.sourceCode;area.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(()=>{
      btn.click();
      console.log('[CF-Inject] Submitted!');
      post(t.submissionId,'JUDGING',0,null);

      // Poll for verdict
      pollVerdict(t.submissionId);
    },1500);
  }
  attempt(1);
})();

async function pollVerdict(submissionId){
  for(let i=0;i<30;i++){
    await sleep(3000);
    try{
      let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
      let ad=await ar.json();
      if(ad.status!=='OK')continue;
      // Find most recent matching submission
      let subs=ad.result||[];
      let match=subs[0]; // most recent
      if(match&&match.verdict&&match.verdict!=='TESTING'){
        let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
        let sv=vm[match.verdict]||match.verdict;
        post(submissionId,sv,sv==='ACCEPTED'?100:0,match.id,null,match.timeConsumedMillis||0,(match.memoryConsumedBytes/1024)|0);
        console.log('[CF-Inject] Verdict:',sv);
        return;
      }
    }catch(e){}
  }
}

async function post(sid,status,score,cfid,msg,time,mem){
  await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
