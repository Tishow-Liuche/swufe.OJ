chrome.runtime.onMessage.addListener((msg,sender,sendResp)=>{
  if(msg.action==='cf-submit'&&msg.task){
    let t=msg.task;
    let m=t.remoteProblemId.match(/^(\d+)([A-Z]\d?)$/);
    if(!m){sendResp({ok:0});return true}
    chrome.storage.local.set({cf_pending_task:t}).then(()=>{
      chrome.tabs.create({url:'https://codeforces.com/problemset/submit/'+m[1]+'/'+m[2],active:true});
    });
    sendResp({ok:1});
  }
  return true;
});
