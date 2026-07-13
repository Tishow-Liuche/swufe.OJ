const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';
(async function(){
  if(!location.href.includes('/problemset/submit/'))return;
  console.log('[CF] Page loaded');
  let task=null;
  for(let i=0;i<15;i++){let d=await chrome.storage.local.get(['cf_pending_task']);if(d.cf_pending_task){task=d.cf_pending_task;break}await sleep(1000)}
  if(!task)return console.log('[CF] No task');
  await chrome.storage.local.remove('cf_pending_task');
  console.log('[CF] Task:',task.remoteProblemId);
  let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[task.language]||'73';
  for(let n=0;n<60;n++){
    let sel=document.querySelector('select[name="programTypeId"]'),area=document.querySelector('textarea[name="source"]'),btn=document.querySelector('input.submit[type="submit"]');
    if(sel&&area&&btn){
      console.log('[CF] Form found!');
      sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
      area.value=task.sourceCode;area.dispatchEvent(new Event('input',{bubbles:true}));
      setTimeout(()=>{btn.click();console.log('[CF] CLICKED');poll(task.submissionId)},1000);
      return;
    }
    await sleep(800);
  }
  post(task.submissionId,'REMOTE_ERROR',0,null,'CF表单超时');
})();

async function poll(sid2){for(let i=0;i<40;i++){await sleep(3000);try{let r=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=5');let d=await r.json();if(d.status!=='OK')continue;let sub=(d.result||[])[0];if(sub&&sub.verdict&&sub.verdict!=='TESTING'){let vm={OK:'ACCEPTED',WRONG_ANSWER:'答错',TIME_LIMIT_EXCEEDED:'超时',MEMORY_LIMIT_EXCEEDED:'超内存',RUNTIME_ERROR:'运行错',COMPILATION_ERROR:'编译错'};let sv=vm[sub.verdict]||sub.verdict;post(sid2,sv,sv==='ACCEPTED'?100:0,sub.id,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);return}}catch(e){}}}

async function post(sid,status,score,cfid,msg,time,mem){await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
