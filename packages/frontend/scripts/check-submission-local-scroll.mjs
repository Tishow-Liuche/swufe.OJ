import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'chromium',headless:true});
const base=process.env.UI_BASE_URL||'http://127.0.0.1:5193';
const user={id:'u1',username:'student',nickname:'测试选手',role:'STUDENT'};
const rows=Array.from({length:80},(_,i)=>({id:`s${i}`,user,problem:{id:'p1',problemNo:1,label:'A',title:'测试题'},status:'ACCEPTED',language:'cpp',timeUsed:3,memoryUsed:1024,createdAt:'2026-09-20T00:00:00Z'}));
const contest={id:'c1',title:'滚动验收',state:'RUNNING',mode:'ACM',visibility:'PUBLIC',startTime:'2026-09-20T00:00:00Z',endTime:'2099-01-01T00:00:00Z',participant:{isVirtual:false},problems:[],organizer:{name:'赛事组'}};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:1280,height:600}]){
  const context=await browser.newContext({viewport});let rowCount=80;
  const errors=[];
  await context.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;let body={};
   if(path==='/api/auth/refresh')body={accessToken:'test'};
   else if(path==='/api/user/profile')body=user;
   else if(path==='/api/contests/c1')body=contest;
   else if(path==='/api/contests/c1/submissions'||path==='/api/submissions')body={items:rows.slice(0,rowCount),total:rowCount};
   else if(path.match(/\/submissions\/s\d+$/))body={...rows[0],sourceCode:'int main() { return 0; }',cases:[]};
   else if(path==='/api/problems/p1')body={id:'p1',title:'滚动验收题',versions:[{description:'题面不应被提交记录撑长'}],tags:[]};
   return route.fulfill({json:body});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const kind of ['problem','contest'].filter(kind=>!process.env.SCROLL_KIND||kind===process.env.SCROLL_KIND)){
   await page.goto(base+(kind==='problem'?'/problems/p1':'/contests/c1/submissions'));
   const selector=kind==='problem'?'.problem-submission-list':'.arena-submissions .arena-table-wrap';
   const region=page.locator(selector);await region.waitFor();
   const metrics=await region.evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight,height:el.getBoundingClientRect().height}));
   assert(metrics.scroll>metrics.client+100,`${kind}: many records must overflow inside their container`);
   assert(metrics.height<=viewport.height*.56+2,`${kind}: record region must be bounded by viewport`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind}: no document horizontal overflow`);
   assert.equal(await region.getAttribute('tabindex'),'0');
   await region.evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(150);
   const box=await region.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(box.height/2,100));
   const y=await page.evaluate(()=>scrollY);
   await page.mouse.wheel(0,250);
   await page.waitForFunction(s=>document.querySelector(s).scrollTop>10,selector);
   await page.waitForTimeout(150);
   assert(Math.abs((await page.evaluate(()=>scrollY))-y)<2,`${kind}: wheel must not move page`);
   if(kind==='contest'){
    const header=await region.locator('th').first().boundingBox();const current=await region.boundingBox();
    assert(Math.abs(header.y-current.y)<3,'contest header must stay at top of scroll region');
   }
   await region.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.waitForTimeout(100);
   const edgeY=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,600);await page.waitForTimeout(250);
   assert(Math.abs((await page.evaluate(()=>scrollY))-edgeY)<2,`${kind}: lower edge must not chain scroll to page`);
   await region.evaluate(el=>{el.scrollTop=0});
   const topY=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,-600);await page.waitForTimeout(250);
   assert(Math.abs((await page.evaluate(()=>scrollY))-topY)<2,`${kind}: upper edge must not chain scroll to page`);
   await region.focus();await page.keyboard.press('ArrowDown');
   await page.waitForFunction(s=>document.querySelector(s).scrollTop>0,selector);
   if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/record-scroll-${kind}-${viewport.width}.png`});
   await region.locator(kind==='problem'?'.problem-submission-row':'.arena-text-button').first().click();
   await page.getByText('int main() { return 0; }',{exact:true}).waitFor();
   rowCount=2;await page.goto(base+(kind==='problem'?'/problems/p1':'/contests/c1/submissions'));await region.waitFor();
   assert(await region.evaluate(el=>el.scrollHeight<=el.clientHeight+1),`${kind}: short lists should not force vertical overflow`);
   rowCount=80;
   console.log(`PASS ${kind} ${viewport.width}x${viewport.height}: bounded internal wheel/keyboard scroll, edge containment, detail click and short list`);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}
