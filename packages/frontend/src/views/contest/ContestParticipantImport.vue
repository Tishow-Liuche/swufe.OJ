<script setup lang="ts">
import {computed,reactive,ref,watch} from 'vue';
import {useTimestamp} from '@vueuse/core';
import {useAuthStore} from '../../stores/auth';
import api from '../../api/client';
import {errorText,type Contest} from './contest';
import {parseParticipantRows,type ParticipantRow} from './participant-import';
const props=defineProps<{contest:Contest}>();
const emit=defineEmits<{reload:[]}>();
const auth=useAuthStore();
const now=useTimestamp({interval:1000});
const ended=computed(()=>props.contest.state==='ENDED'||now.value>=Date.parse(props.contest.endTime));
const mode=ref<'single'|'batch'>('single');
const form=reactive<ParticipantRow>({username:'',studentId:'',realName:''});
const rows=ref<ParticipantRow[]>([]);const fileName=ref('');
const busy=ref(false);const reading=ref(false);const error=ref('');
type Result={imported:number;skipped:number;invalid:number;results:Array<ParticipantRow & {row:number;status:string;message:string}>};
const result=ref<Result|null>(null);
watch(()=>props.contest.id,()=>{rows.value=[];result.value=null;error.value='';fileName.value='';});
async function readFile(event:Event){
  const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';
  if(!file||busy.value||reading.value)return;
  rows.value=[];result.value=null;fileName.value='';error.value='';reading.value=true;
  try{
    if(!/\.(xlsx|xls|csv)$/i.test(file.name)||file.size>5*1024*1024)throw new Error('请选择不超过 5 MB 的 Excel 或 CSV 文件');
    const XLSX=await import('xlsx');
    const bytes=new Uint8Array(await file.arrayBuffer());
    // Detect content, not extension: some exports contain CSV with an .xls name.
    // Text parsers do not expose !fullref, so read size-bounded text completely.
    const binary=[0x50,0x4b,0x03,0x04].every((b,i)=>bytes[i]===b)
      ||[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((b,i)=>bytes[i]===b);
    const book=XLSX.read(bytes,{type:'array',raw:true,...(binary?{sheetRows:502}:{})});
    const sheet=book.Sheets[book.SheetNames[0]!];if(!sheet)throw new Error('文件没有可读取的工作表');
    if(sheet['!fullref'])throw new Error('工作表超过读取范围，请删除多余空行并将参赛者分为每批最多 500 行');
    rows.value=parseParticipantRows(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:false,defval:''}));
    fileName.value=file.name;
  }catch(e){error.value=e instanceof Error?e.message:'文件读取失败，请检查文件格式';}finally{reading.value=false;}
}
async function template(){
  try{
    const XLSX=await import('xlsx');const book=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([['账号','学号','姓名']]);sheet['!cols']=[{wch:24},{wch:18},{wch:18}];
    XLSX.utils.book_append_sheet(book,sheet,'参赛者');XLSX.writeFile(book,'比赛参赛者导入模板.xlsx');
  }catch(e){error.value=errorText(e,'模板下载失败');}
}
async function submit(){
  if(busy.value||reading.value||ended.value||auth.user?.role!=='ADMIN')return;
  const payload=mode.value==='single'?[{...form}]:rows.value;
  if(!payload.length||(mode.value==='single'&&!form.username.trim()&&!form.studentId.trim())){error.value='请填写账号或学号，或选择导入文件';return;}
  busy.value=true;error.value='';result.value=null;
  try{
    const {data}=await api.post(`/api/contests/${props.contest.id}/participants/import`,{rows:payload},{timeout:30000});
    result.value=data;if(data.imported)emit('reload');
  }catch(e){error.value=errorText(e,'补录失败，请稍后重试；重复导入不会覆盖已有报名');}finally{busy.value=false;}
}
</script>
<template>
  <section v-if="auth.user?.role==='ADMIN'" class="participant-import" aria-label="管理员补录参赛者">
    <div class="arena-section-head"><h2>补录参赛者</h2><span class="admin-label">管理员</span></div>
    <p class="import-help">可在报名截止后补录，比赛时间和已有成绩不变。主输入框支持登录账号、唯一昵称或已绑定学号；账号优先匹配，重名时请用登录账号或单独填写绑定学号。</p>
    <p v-if="ended" class="arena-empty">比赛已结束，不能补录参赛者。</p>
    <template v-else>
      <div class="import-tabs" role="group" aria-label="补录方式">
        <button type="button" :aria-pressed="mode==='single'" :disabled="busy||reading" @click="mode='single'">单人添加</button>
        <button type="button" :aria-pressed="mode==='batch'" :disabled="busy||reading" @click="mode='batch'">批量导入</button>
      </div>
      <form @submit.prevent="submit">
        <fieldset :disabled="busy||reading">
          <div v-if="mode==='single'" class="import-fields">
            <label>账号 / 昵称 / 学号<input v-model="form.username" maxlength="100" placeholder="输入登录账号、唯一昵称或绑定学号" /></label>
            <label>绑定学号<input v-model="form.studentId" maxlength="100" placeholder="填写已绑定的学号" /></label>
            <label v-if="contest.visibility==='CAMPUS_PRIVATE'">真实姓名<input v-model="form.realName" required maxlength="40" placeholder="校赛必填" /></label>
          </div>
          <div v-else class="import-upload">
            <div class="import-actions"><label class="arena-button secondary">{{reading?'读取中…':'选择 Excel / CSV'}}<input class="upload-input" type="file" accept=".xlsx,.xls,.csv" @change="readFile" /></label><button type="button" class="arena-button secondary" @click="template">下载模板</button></div>
            <p class="import-help">首个工作表支持“账号、学号、姓名”列，每批最多 500 行，文件不超过 5 MB。请将学号列设为文本，避免丢失前导零。校赛必须填写姓名。</p>
            <p v-if="rows.length">{{fileName}} · 共 {{rows.length}} 行，确认后导入</p>
            <div v-if="rows.length" class="import-table" tabindex="0" aria-label="导入预览"><table><thead><tr><th>序号</th><th>账号</th><th>学号</th><th>姓名</th></tr></thead><tbody><tr v-for="(row,index) in rows" :key="index"><td>{{index+1}}</td><td>{{row.username||'—'}}</td><td>{{row.studentId||'—'}}</td><td>{{row.realName||'—'}}</td></tr></tbody></table></div>
          </div>
          <button class="arena-button" :disabled="mode==='batch'&&!rows.length">{{busy?'正在补录…':mode==='batch'?'确认导入':'添加参赛者'}}</button>
        </fieldset>
      </form>
    </template>
    <p v-if="error" class="arena-error" role="alert">{{error}}</p>
    <div v-if="result" class="import-result" role="status">
      <p>导入完成：成功 {{result.imported}} 人，跳过 {{result.skipped}} 行，失败 {{result.invalid}} 行。</p>
      <div class="import-table" tabindex="0" aria-label="导入结果"><table><thead><tr><th>行</th><th>账号 / 学号</th><th>结果</th><th>说明</th></tr></thead><tbody><tr v-for="row in result.results" :key="row.row"><td>{{row.row}}</td><td>{{row.username||row.studentId||'—'}}</td><td :class="row.status">{{{imported:'成功',skipped:'跳过',invalid:'失败'}[row.status]}}</td><td>{{row.message}}</td></tr></tbody></table></div>
    </div>
  </section>
</template>
<style scoped>
.participant-import{margin-top:32px;padding-top:28px;border-top:1px solid var(--arena-line,#dce7f7);min-width:0}
.admin-label{font-size:12px;color:#386cb2;background:#edf4ff;border:1px solid #d5e4fc;padding:4px 10px;border-radius:7px}
.import-help{color:var(--arena-muted,#617697);font-size:13px;line-height:1.8}
.import-tabs{display:flex;gap:6px;margin:20px 0;background:#f1f6fd;padding:4px;border-radius:10px;width:fit-content}
.import-tabs button{border:0;border-radius:7px;padding:9px 18px;background:transparent;color:#536b8b;cursor:pointer}
.import-tabs button[aria-pressed=true]{background:white;color:#2467cb;box-shadow:0 2px 7px #28579614}
fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled{opacity:.7}
.import-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:16px;margin:18px 0}
.import-fields label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}
.import-fields input{width:100%;padding:11px 12px;border:1px solid #ccdbee;border-radius:9px;background:#fff;color:#243952;font:inherit}
.import-fields input:focus{outline:2px solid #c4dbff;border-color:#6ba3ef}
.import-actions{display:flex;flex-wrap:wrap;gap:10px}.upload-input{position:absolute;width:1px;height:1px;opacity:0}
.import-table{max-height:320px;overflow:auto;margin:16px 0;border:1px solid #dce7f7;border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:13px;text-align:left}th,td{padding:11px 14px;border-bottom:1px solid #edf1f7;overflow-wrap:anywhere;min-width:64px}th{position:sticky;top:0;background:#f2f7fe;color:#536b8b}td.imported{color:#18764b}td.invalid{color:#ac4242}td.skipped{color:#64748b}
.import-result{margin-top:20px}.import-result>p{font-size:14px;font-weight:600}button:disabled{cursor:not-allowed}
</style>
