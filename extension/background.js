const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn';

chrome.runtime.onMessage.addListener((msg,sender,sendResp)=>{
  if(msg.action==='cf'&&msg.task){handle(msg.task);sendResp({ok:1})}
  return true
});

async function handle(t){
  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);if(!m)return;
  let cid=+m[1],pidx=m[2];

  // Phase 1: detect form structure
  let tab=await chrome.tabs.create({url:'https://codeforces.com/problemset/submit/'+cid+'/'+pidx,active:true});
  await sleep(8000);

  // Try detection + submit
  let attempts=0;
  while(attempts<3){
    attempts++;
    let [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:submitUniversal,args:[{cid,pidx,lang:t.language,code:t.sourceCode,attempt:attempts}],world:'MAIN'});

    if(r?.result?.sid){
      let sid=r.result.sid; post(t.submissionId,'JUDGING',0,sid);
      for(let i=0;i<20;i++){await sleep(3000);
        try{let ar=await fetch('https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=10');
          let ad=await ar.json();if(ad.status!=='OK')continue;
          let sub=(ad.result||[]).find(x=>x.id===sid);
          if(sub&&sub.verdict&&sub.verdict!=='TESTING'){
            let vm={OK:'ACCEPTED',WRONG_ANSWER:'WRONG_ANSWER',TIME_LIMIT_EXCEEDED:'TIME_LIMIT_EXCEEDED',MEMORY_LIMIT_EXCEEDED:'MEMORY_LIMIT_EXCEEDED',RUNTIME_ERROR:'RUNTIME_ERROR',COMPILATION_ERROR:'COMPILE_ERROR'};
            post(t.submissionId,vm[sub.verdict]||sub.verdict,sub.verdict==='OK'?100:0,sid,null,sub.timeConsumedMillis||0,(sub.memoryConsumedBytes/1024)|0);break;
          }}catch(e){}
      }
      try{chrome.tabs.remove(tab.id)}catch(e){}
      return;
    }
    if(r?.result?.done) break;
    await sleep(3000); // wait for page to fully load if first attempt failed
  }
  post(t.submissionId,'REMOTE_ERROR',0,null,'CF 提交失败：无法找到提交表单或无法提取 Submission ID');
  try{chrome.tabs.remove(tab.id)}catch(e){}
}

async function post(sid,status,score,cfid,msg,time,mem){
  await fetch(S+'/api/submissions/'+sid+'/fill-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,score:score||0,remoteSubmissionId:cfid?String(cfid):'N/A',userId:U,compileMessage:msg||null,timeUsed:time||0,memoryUsed:mem||0})}).catch(()=>{})
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// ===== UNIVERSAL CF SUBMIT FUNCTION =====
function submitUniversal(args){
  let LANG={cpp:'73',c:'61',python:'70',java:'60'},pt=LANG[args.lang]||'73';

  return new Promise(resolve=>{
    function tryIt(n){
      if(n>40) return resolve({done:true,error:'CF页面超时'});

      // FIND ALL POSSIBLE FORM ELEMENTS
      let selects=document.querySelectorAll('select');
      let textareas=document.querySelectorAll('textarea');
      let inputs=document.querySelectorAll('input[type="submit"], button[type="submit"], .submit, #submit');
      let languageSelects=document.querySelectorAll('select[name="programTypeId"], select[name="lang"], select[class*="program"]');
      let sourceAreas=document.querySelectorAll('textarea[name="source"], textarea[class*="source"], textarea[placeholder*="code"], textarea[placeholder*="source"], .ace_text-input');

      if(args.attempt===1) console.log('[CF-Detect] Selects:'+selects.length+' TextAreas:'+textareas.length+' LangSelects:'+languageSelects.length+' SourceAreas:'+sourceAreas.length+' SubmitBtns:'+inputs.length);

      // Strategy 1: Classic CF page (<2024)
      let classicSel=document.querySelector('select[name="programTypeId"]');
      let classicArea=document.querySelector('textarea[name="source"]');
      let classicBtn=document.querySelector('input.submit[type="submit"]');
      if(classicSel&&classicArea&&classicBtn){
        console.log('[CF-Detect] Classic form found');
        classicSel.value=pt;classicSel.dispatchEvent(new Event('change',{bubbles:true}));
        classicArea.value=args.code;classicArea.dispatchEvent(new Event('input',{bubbles:true}));
        setTimeout(()=>{classicBtn.click();console.log('[CF-Submit] Clicked classic');pollSID(resolve,30)},2000);
        return;
      }

      // Strategy 2: Any textarea + any select
      if(textareas.length>0 && selects.length>0){
        // Find the most likely textarea (biggest one or with 'source' in name)
        let area=document.querySelector('textarea[name="source"]')||document.querySelector('textarea[placeholder*="code"]')||textareas[0];
        let sel=languageSelects[0]||selects[0];
        let btn=document.querySelector('input[type="submit"]')||document.querySelector('button[type="submit"]')||document.querySelector('.submit');

        if(area&&sel&&btn){
          console.log('[CF-Detect] Strategy2: generic form');
          try{sel.value=pt;sel.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){}
          area.value=args.code;area.dispatchEvent(new Event('input',{bubbles:true}));
          setTimeout(()=>{btn.click();console.log('[CF-Submit] Strategy2 clicked');pollSID(resolve,25)},2000);
          return;
        }
      }

      // Strategy 3: ACE editor search
      let aceEditor=document.querySelector('.ace_text-input');
      if(aceEditor){
        console.log('[CF-Detect] ACE editor found');
        // ACE editors need special handling
        let aceInput=document.querySelector('.ace_text-input');
        let btn2=document.querySelector('#submit')||document.querySelector('input[type="submit"]')||document.querySelector('.submit');
        if(aceInput&&btn2){
          // Try to set ACE value via React
          try{
            aceInput.focus();
            aceInput.value=args.code;
            aceInput.dispatchEvent(new Event('input',{bubbles:true}));
            aceInput.dispatchEvent(new Event('change',{bubbles:true}));
          }catch(e){}
          setTimeout(()=>{
            try{btn2.click()}catch(e){}
            console.log('[CF-Submit] ACE strategy clicked');
            pollSID(resolve,25);
          },2000);
          return;
        }
      }

      setTimeout(()=>tryIt(n+1),1000);
    }

    tryIt(1);
  });

  function pollSID(resolve,maxTries){
    let c=0,iv=setInterval(()=>{c++;
      let el=document.querySelector('tr[data-submission-id]');
      if(el){clearInterval(iv);resolve({sid:+el.getAttribute('data-submission-id')});return}
      let m2=location.href.match(/\/status\/(\d+)/);
      if(m2){clearInterval(iv);resolve({sid:+m2[1]});return}
      if(c>maxTries){clearInterval(iv);resolve({done:true,error:'NO_SID after polling'})}
    },1200)
  }
}
