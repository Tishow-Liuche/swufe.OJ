/**
 * OJ content script — finds CF task → saves to storage → opens CF page
 * No background.js needed. inject.js handles the rest on CF page.
 */
const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',done=new Set();

setInterval(async()=>{
  try{
    let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=cs');
    if(!r.ok)return;
    let t=await r.json();
    if(!t||!t.taskId||t.platform!=='CODEFORCES'||done.has(t.taskId))return;
    done.add(t.taskId);
    console.log('[OJ-CS] FOUND CF TASK:',t.remoteProblemId,t.submissionId);

    let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
    if(!m)return;

    // Save task for inject.js
    await chrome.storage.local.set({cf_pending_task:t});

    // Open CF submit page directly
    let url='https://codeforces.com/problemset/submit/'+m[1]+'/'+m[2];
    console.log('[OJ-CS] Opening:',url);
    window.open(url,'_blank');
  }catch(e){console.error('[OJ-CS]',e.message)}
},5000);
