import {createApp,nextTick} from 'vue';
import {expect,it,vi} from 'vitest';
import Component from './ContestSubmissions.vue';
const feed=vi.hoisted(()=>({url:undefined as undefined|(()=>string)}));
vi.mock('../../stores/auth',()=>({useAuthStore:()=>({user:{id:'self',role:'TEACHER'}})}));
vi.mock('./useContestFeed',()=>({useContestFeed:(url:()=>string)=>{feed.url=url;return {data:{problems:[{id:'p1',label:'A',title:'Sum'}]},error:'',loading:false,updatedAt:null,refresh:vi.fn()};}}));
it('combines problem selection with nickname and ownership in the feed URL',async()=>{
  const app=createApp(Component,{contest:{id:'c1',visibility:'CAMPUS_PRIVATE',problems:[]} as any});
  const host=document.createElement('div');app.mount(host);
  try{
    const select=host.querySelector('select[aria-label="筛选题目"]') as HTMLSelectElement;
    expect(host.querySelector('.submission-filter-toolbar')?.firstElementChild?.matches('form.submission-search')).toBe(true);
    expect(select?.closest('th')?.getAttribute('scope')).toBe('col');
    expect(host.querySelector('.submission-filter-toolbar select')).toBeNull();
    expect(host.querySelector('tbody')?.textContent).toContain('暂无提交记录');
    expect(select).not.toBeNull();expect(select.textContent).toContain('Sum');select.value='p1';select.dispatchEvent(new Event('change'));await nextTick();
    const state=(app as any)._instance.setupState;state.onlyMine=true;state.appliedNickname='Alice';await nextTick();
    const url=new URL(feed.url!(),'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({problemId:'p1',mine:'true',nickname:'Alice'});
  }finally{app.unmount();}
});
