const S='http://127.0.0.1:3000',U='cmrj7k0hm00006eqfpcjxuwgn',done=new Set();
setInterval(async()=>{
  try{
    let r=await fetch(S+'/api/helper/tasks/next?userId='+U+'&deviceId=cs');
    if(!r.ok)return;
    let t=await r.json();
    if(t&&t.taskId&&t.platform==='CODEFORCES'&&!done.has(t.taskId)){
      done.add(t.taskId);
      console.log('[OJ-CS] Task:',t.remoteProblemId);
      chrome.runtime.sendMessage({action:'cf-submit',task:t}).catch(()=>{});
    }
  }catch(e){}
},5000);
