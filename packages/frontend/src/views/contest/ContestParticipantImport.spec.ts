import {createApp,nextTick} from 'vue';
import {afterEach,expect,it,vi} from 'vitest';
import Component from './ContestParticipantImport.vue';
import api from '../../api/client';
import * as XLSX from 'xlsx';
const auth=vi.hoisted(()=>({user:{role:'ADMIN'}}));
vi.mock('../../stores/auth',()=>({useAuthStore:()=>auth}));
vi.mock('../../api/client',()=>({default:{post:vi.fn()}}));
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());auth.user.role='ADMIN';vi.clearAllMocks();});
function mount(overrides={}){
  const reload=vi.fn();
  const app=createApp(Component,{contest:{id:'c1',state:'RUNNING',visibility:'PUBLIC',endTime:'2099-01-01',...overrides} as any,onReload:reload});
  const host=document.createElement('div');app.mount(host);cleanup.push(()=>app.unmount());
  return {host,state:(app as any)._instance.setupState,reload};
}
it('hides controls from non-admins and prevents ended contest submission',async()=>{
  auth.user.role='STUDENT';expect(mount().host.textContent).not.toContain('补录参赛者');
  auth.user.role='ADMIN';const {host,state}=mount({endTime:'2020-01-01'});
  expect(host.textContent).toContain('比赛已结束');state.form.username='alice';await state.submit();expect(api.post).not.toHaveBeenCalled();
});
it('submits exact identifiers, renders row results and reloads registration',async()=>{
  vi.mocked(api.post).mockResolvedValue({data:{imported:1,skipped:0,invalid:0,results:[{row:1,username:'alice',status:'imported',message:'补录成功'}]}});
  const {host,state,reload}=mount();state.form.username='alice';await state.submit();await nextTick();
  expect(api.post).toHaveBeenCalledWith('/api/contests/c1/participants/import',{rows:[{username:'alice',studentId:'',realName:''}]},{timeout:30000});
  expect(host.textContent).toContain('补录成功');expect(reload).toHaveBeenCalledOnce();
});
it('shows actionable local file validation errors',async()=>{
  const {host,state}=mount();await state.readFile({target:{files:[{name:'bad.txt',size:1}],value:'x'}});await nextTick();
  expect(host.textContent).toContain('请选择不超过 5 MB 的 Excel 或 CSV 文件');
});
it('previews real XLSX text IDs without writing until confirmation',async()=>{
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['学号'],['00123']]),'Sheet1');
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});
  const {state}=mount();await state.readFile({target:{files:[{name:'users.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes}],value:'x'}});
  expect(state.rows).toEqual([{username:'',studentId:'00123',realName:''}]);expect(api.post).not.toHaveBeenCalled();
});
it.each(['csv','xls','xlsx'])('reads complete CSV content named .%s without dropping users after blank rows',async extension=>{
  const bytes=new TextEncoder().encode('username\nalice\n'+Array(501).fill('\n').join('')+'bob\n');
  const {state}=mount();await state.readFile({target:{files:[{name:`users.${extension}`,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer}],value:'x'}});
  expect(state.rows.map((r:any)=>r.username)).toEqual(['alice','bob']);expect(api.post).not.toHaveBeenCalled();
});
it('rejects truncated XLSX including sparse rows',async()=>{
  const book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([['账号'],['alice']]);
  XLSX.utils.sheet_add_aoa(sheet,[['bob']],{origin:'A513'});XLSX.utils.book_append_sheet(book,sheet,'Sheet1');
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});
  const {state}=mount();await state.readFile({target:{files:[{name:'users.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes}],value:'x'}});
  expect(state.rows).toHaveLength(0);expect(state.error).toContain('超过');expect(api.post).not.toHaveBeenCalled();
});
