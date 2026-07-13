const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';
let busy=false;

chrome.alarms.create('p',{periodInMinutes:0.2});
chrome.alarms.onAlarm.addListener(()=>{if(!busy)poll()});
poll();

async function poll(){
 try{
  let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=bg');
  if(!r.ok)return;
  let t=await r.json();
  if(!t||!t.taskId||t.platform!=='CODEFORCES')return;
  busy=true;
  console.log('[BG] Task:',t.remoteProblemId);
  await submit(t);
  busy=false;
 }catch(e){busy=false}
}

async function submit(t){
 let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);if(!m)return;
 let cid=+m[1],pidx=m[2];
 try{
  // Open CF submit page
  let tab=await chrome.tabs.create({url:'https://codeforces.com/problemset/submit/'+cid+'/'+pidx,active:true});
  await sleep(6000);
  // Inject: fill form + click submit
  let [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:doSubmit,args:[{cid,pidx,lang:t.language,code:t.sourceCode}]});
  if(r?.result?.sid){
   let sid=r.result.sid;post(t.submissionId,'JUDGING',0,sid);
   // Poll verdict
   for(let i=0;i<30;i++){await sleep(3000);
    try{let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');let ad=await ar.json();if(ad.status!=='OK')continue;let sub=(ad.result||[]).find(x=>x.id===sid);if(sub&&sub.verdict&&sub.verdict!=='TESTING'){let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};let sv=vm[sub.verdict]||sub.verdict;post(t.submissionId,sv,sv==='ACCEPTED'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);break}}catch(e){}}
  } else {
   post(t.submissionId,'REMOTE_ERROR',0,null,r?.result?.error||'提交失败');
  }
  try{chrome.tabs.remove(tab.id)}catch(e){}
 }catch(e){post(t.submissionId,'REMOTE_ERROR',0,null,e.message)}
}

function doSubmit(args){
 let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[args.lang]||'73';
 return new Promise(resolve=>{
  function trySubmit(n){
   let sel=document.querySelector('select[name="programTypeId"]'),area=document.querySelector('textarea[name="source"]'),btn=document.querySelector('input.submit[type="submit"]');
   if(!sel||!area||!btn){if(n<60)return setTimeout(()=>trySubmit(n+1),800);return resolve({error:'CF表单加载超时(48s) — 请确认已登录 codeforces.com'})}
   sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
   area.value=args.code;area.dispatchEvent(new Event('input',{bubbles:true}));
   setTimeout(()=>{btn.click();let c=0,iv=setInterval(()=>{c++;let el=document.querySelector('tr[data-submission-id]');if(el){clearInterval(iv);resolve({sid:+el.getAttribute('data-submission-id')})}let m2=location.href.match(/\/status\/(\d+)/);if(m2){clearInterval(iv);resolve({sid:+m2[1]})}if(c>45){clearInterval(iv);resolve({error:'无法提取Submission ID(45s)'})}},1000)},1500)
  }
  trySubmit(1)
 })
}

async function post(sid,status,score,cfid,msg,time,mem){
 await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid||''):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
