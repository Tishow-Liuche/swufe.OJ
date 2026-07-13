const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',D=new Set(),B=false;

console.log('[CF-Helper] Content script loaded on',location.href);

setInterval(async()=>{
 if(B)return;
 try{
  let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=v21');
  if(!r.ok)return;
  let t=await r.json();
  if(!t||!t.taskId||t.platform!=='CODEFORCES'||D.has(t.taskId))return;
  D.add(t.taskId);B=true;
  console.log('[CF-Helper] Processing:',t.remoteProblemId,t.submissionId);

  let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
  if(!m){B=false;return}
  let cid=+m[1],pidx=m[2];

  // Store task → open CF tab → inject.js handles the rest
  chrome.storage.local.set({cf_task:t},()=>{
   let url='https://codeforces.com/problemset/submit/'+cid+'/'+pidx;
   console.log('[CF-Helper] Opening CF tab:',url);
   window.open(url,'_blank');
   B=false;
  });
 }catch(e){B=false}
},5000);
