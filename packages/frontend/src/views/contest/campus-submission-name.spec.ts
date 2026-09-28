import {createApp,nextTick} from 'vue';
import {expect,it,vi} from 'vitest';
import Submissions from './ContestSubmissions.vue';
import Dialog from './ContestSubmissionDialog.vue';
import api from '../../api/client';
vi.mock('../../api/client',()=>({default:{get:vi.fn()}}));
vi.mock('../../stores/auth',()=>({useAuthStore:()=>({user:{id:'u1',role:'ADMIN'}})}));
const user={nickname:'Account nickname',username:'login',displayName:'张三（42411036）'};
it('renders registration name in list and labels campus identity search',async()=>{
  vi.mocked(api.get).mockResolvedValue({data:{items:[{id:'s1',user,createdAt:'2026-09-28T10:00:00Z'}]}});
  const app=createApp(Submissions,{contest:{id:'c1',visibility:'CAMPUS_PRIVATE'} as any});const host=document.createElement('div');app.mount(host);
  try{await Promise.resolve();await nextTick();expect(host.textContent).toContain(user.displayName);expect(host.querySelector('input')?.placeholder).toContain('姓名或学号');}finally{app.unmount();}
});
it('renders the same name in submission details',async()=>{
  HTMLDialogElement.prototype.showModal=vi.fn();HTMLDialogElement.prototype.close=vi.fn();
  vi.mocked(api.get).mockResolvedValue({data:{id:'s1',user}});
  const app=createApp(Dialog,{contestId:'c1',submissionId:'s1'});const host=document.createElement('div');app.mount(host);
  try{await Promise.resolve();await nextTick();expect(host.textContent).toContain(user.displayName);}finally{app.unmount();}
});
