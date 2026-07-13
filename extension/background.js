const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';

// Content script wakes us via message — guaranteed by Chrome MV3
chrome.runtime.onMessage.addListener((msg,sender,sendResp)=>{
  if(msg.action==='cf'&&msg.task){handleCF(msg.task);sendResp({ok:1})}
  return true
});

async function handleCF(t){
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);if(!m)return;
  let cid=+m[1],pidx=m[2];
  try{
    let tab=await chrome.tabs.create({url:'https://codeforces.com/problemset/submit/'+cid+'/'+pidx,active:true});
    await sleep(8000);
    let [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:doSubmit,args:[{cid,pidx,lang:t.language,code:t.sourceCode}]});
    if(r&&r.result&&r.result.sid){
      let sid=r.result.sid; post(t.submissionId,'JUDGING',0,sid);
      for(let i=0;i<25;i++){await sleep(3000);
        try{let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
          let ad=await ar.json();if(ad.status!=='OK')continue;
          let sub=(ad.result||[]).find(x=>x.id===sid);
          if(sub&&sub.verdict&&sub.verdict!=='TESTING'){
            let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
            post(t.submissionId,vm[sub.verdict]||sub.verdict,sub.verdict==='OK'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);break;
          }}catch(e){}
      }
    }else{post(t.submissionId,'REMOTE_ERROR',0,null,(r&&r.result?r.result.error:'提交失败'))}
    try{chrome.tabs.remove(tab.id)}catch(e){}
  }catch(e){post(t.submissionId,'REMOTE_ERROR',0,null,e.message)}
}

async function post(sid,status,score,cfid,msg,time,mem){
  await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

function doSubmit(args){
  let L={cpp:'73',c:'61',python:'70',java:'60'},pt=L[args.lang]||'73';
  return new Promise(resolve=>{
    function trySubmit(n){
      let sel=document.querySelector('select[name="programTypeId"]'),area=document.querySelector('textarea[name="source"]'),btn=document.querySelector('input.submit[type="submit"]');
      if(!sel||!area||!btn){if(n<20)return setTimeout(()=>trySubmit(n+1),800);return resolve({error:'CF页面加载超时，请确认已登录'})}
      sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}));
      area.value=args.code;area.dispatchEvent(new Event('input',{bubbles:true}));
      setTimeout(()=>{btn.click();let c=0,iv=setInterval(()=>{c++;let el=document.querySelector('tr[data-submission-id]');if(el){clearInterval(iv);resolve({sid:+el.getAttribute('data-submission-id')})}let m2=location.href.match(/\/status\/(\d+)/);if(m2){clearInterval(iv);resolve({sid:+m2[1]})}if(c>30){clearInterval(iv);resolve({error:'NO_SID'})}},1000)},2000)
    }
    trySubmit(1)
  })
}
