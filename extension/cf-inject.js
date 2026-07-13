const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';

(async function(){
 // Only run on CF submit pages
 if(!location.href.includes('/problemset/submit/'))return;
 console.log('[CF-Inject] On CF submit page:',location.href);

 // Wait for page to fully load (CF has Cloudflare JS challenge first)
 await new Promise(r=>setTimeout(r,4000));

 // Get pending task from storage
 let data=await chrome.storage.local.get(['cf_task']);
 if(!data.cf_task){console.log('[CF-Inject] No pending task');return}
 let t=data.cf_task;
 // Check we're on the right problem
 let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
 if(!m)return;
 let cid=+m[1],pidx=m[2];
 if(!location.href.includes('/'+cid+'/'+pidx)){console.log('[CF-Inject] Wrong problem');return}

 console.log('[CF-Inject] Found task:',t.remoteProblemId,'sub:',t.submissionId);
 await chrome.storage.local.remove('cf_task');

 // Wait for CF form elements (up to 90 seconds)
 let sel=null,area=null,btn=null;
 for(let i=0;i<120;i++){
  sel=document.querySelector('select[name="programTypeId"]');
  area=document.querySelector('textarea[name="source"]');
  btn=document.querySelector('input.submit[type="submit"]');
  if(sel&&area&&btn)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 if(!sel||!area||!btn){
  console.error('[CF-Inject] Form not found after 120s');
  post(t.submissionId,'REMOTE_ERROR',0,null,'CF页面加载超时(120s)');
  return;
 }

 // Fill form
 let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[t.language]||'73';
 sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
 area.value=t.sourceCode;area.dispatchEvent(new Event('input',{bubbles:true}));
 console.log('[CF-Inject] Form filled, clicking submit...');

 // Click submit
 setTimeout(()=>{
  btn.click();
  console.log('[CF-Inject] Submit clicked!');

  // Poll for Submission ID in page
  post(t.submissionId,'JUDGING',0,null);
  let c=0;
  let iv=setInterval(()=>{
   c++;
   let el=document.querySelector('tr[data-submission-id]');
   if(el){
    let sid=+el.getAttribute('data-submission-id');
    clearInterval(iv);
    console.log('[CF-Inject] SID:',sid);
    pollVerdict(t.submissionId,sid);
    return;
   }
   let m2=location.href.match(/\/status\/(\d+)/);
   if(m2){
    let sid=+m2[1];
    clearInterval(iv);
    console.log('[CF-Inject] SID from URL:',sid);
    pollVerdict(t.submissionId,sid);
    return;
   }
   if(c>90){
    clearInterval(iv);
    console.error('[CF-Inject] No SID after 90s');
    // Try API reconciliation
    reconcile(t.submissionId,cid,pidx);
   }
  },1200);
 },1500);
})();

async function pollVerdict(submissionId,sid){
 console.log('[CF-Inject] Polling verdict for',sid);
 for(let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,3000));
  try{
   let r=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
   let d=await r.json();
   if(d.status!=='OK')continue;
   let sub=(d.result||[]).find(x=>x.id===sid);
   if(sub&&sub.verdict&&sub.verdict!=='TESTING'){
    let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
    let sv=vm[sub.verdict]||sub.verdict;
    console.log('[CF-Inject] VERDICT:',sv,sub.timeConsumedMillis+'ms');
    post(submissionId,sv,sv==='ACCEPTED'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);
    return;
   }
  }catch(e){}
 }
}

async function reconcile(submissionId,cid,pidx){
 console.log('[CF-Inject] Reconciling via API...');
 await new Promise(r=>setTimeout(r,6000));
 try{
  let r=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
  let d=await r.json();
  if(d.status==='OK'){
   let match=(d.result||[]).find(s=>s.problem?.contestId===cid&&s.problem?.index===pidx&&(Date.now()/1000-s.creationTimeSeconds)<180);
   if(match){
    console.log('[CF-Inject] Reconciled SID:',match.id);
    pollVerdict(submissionId,match.id);
    return;
   }
  }
  post(submissionId,'REMOTE_ERROR',0,null,'无法获取CF Submission ID');
 }catch(e){post(submissionId,'REMOTE_ERROR',0,null,e.message)}
}

async function post(sid,status,score,cfid,msg,time,mem){
 await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
