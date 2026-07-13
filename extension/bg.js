const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';
let busy=false;

console.log('[BG v2.1] Service worker started');

// Poll immediately + every 15 seconds
async function doPoll(){
 if(busy)return;
 try{
  console.log('[BG] Polling tasks...');
  let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=bg21');
  if(!r.ok){console.log('[BG] Backend unreachable:',r.status);return}
  let t=await r.json();
  if(!t||!t.taskId){console.log('[BG] No task');return}
  if(t.platform!=='CODEFORCES'){console.log('[BG] Not CF:',t.platform);return}
  busy=true;
  console.log('[BG] CF task found!',t.remoteProblemId);
  await handle(t);
  busy=false;
 }catch(e){console.error('[BG] Poll error:',e.message);busy=false}
}

async function handle(t){
 let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
 if(!m){busy=false;return}
 let cid=+m[1],pidx=m[2];
 console.log('[BG] Opening CF tab for',cid,pidx);

 try{
  let tab=await chrome.tabs.create({url:'https://codeforces.com/problemset/submit/'+cid+'/'+pidx,active:true});
  console.log('[BG] Tab created:',tab.id);
  await sleep(6000);
  console.log('[BG] Injecting submit script...');
  let [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:doSubmit,args:[{cid,pidx,lang:t.language,code:t.sourceCode}]});
  console.log('[BG] Inject result:',JSON.stringify(r?.result).substring(0,200));

  if(r?.result?.sid){
   let sid=r.result.sid;
   console.log('[BG] CF SID:',sid);
   post(t.submissionId,'JUDGING',0,sid);
   for(let i=0;i<30;i++){await sleep(3000);
    try{let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');let ad=await ar.json();if(ad.status!=='OK')continue;let sub=(ad.result||[]).find(x=>x.id===sid);if(sub&&sub.verdict&&sub.verdict!=='TESTING'){let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};let sv=vm[sub.verdict]||sub.verdict;console.log('[BG] Verdict:',sv);post(t.submissionId,sv,sv==='ACCEPTED'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);return}}catch(e){}}
  }else{
   console.log('[BG] Submit failed:',r?.result?.error);
   post(t.submissionId,'REMOTE_ERROR',0,null,r?.result?.error||'提交失败');
  }
  try{chrome.tabs.remove(tab.id)}catch(e){}
 }catch(e){console.error('[BG] Error:',e.message);post(t.submissionId,'REMOTE_ERROR',0,null,e.message)}
 busy=false;
}

function doSubmit(args){
 let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[args.lang]||'73';
 return new Promise(resolve=>{
  function trySubmit(n){
   let sel=document.querySelector('select[name="programTypeId"]'),area=document.querySelector('textarea[name="source"]'),btn=document.querySelector('input.submit[type="submit"]');
   console.log('[Inject] n='+n+' sel='+!!sel+' area='+!!area+' btn='+!!btn);
   if(!sel||!area||!btn){if(n<80)return setTimeout(()=>trySubmit(n+1),800);return resolve({error:'CF表单加载超时(64s) — 请确认已在codeforces.com登录'+' title='+document.title})}
   sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
   area.value=args.code;area.dispatchEvent(new Event('input',{bubbles:true}));
   setTimeout(()=>{btn.click();console.log('[Inject] Submit clicked!');let c=0,iv=setInterval(()=>{c++;let el=document.querySelector('tr[data-submission-id]');if(el){clearInterval(iv);resolve({sid:+el.getAttribute('data-submission-id')})}let m2=location.href.match(/\/status\/(\d+)/);if(m2){clearInterval(iv);resolve({sid:+m2[1]})}if(c>60){clearInterval(iv);resolve({error:'无法提取SID(60s) url='+location.href})}},1000)},1500)
  }
  trySubmit(1)
 })
}

async function post(sid,status,score,cfid,msg,time,mem){
 console.log('[BG] Posting result:',status,cfid);
 await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// Start!
doPoll();
setInterval(()=>{if(!busy)doPoll()},15000);
console.log('[BG v2.1] Polling started — every 15s');
