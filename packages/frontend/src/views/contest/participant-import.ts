export type ParticipantRow = { username:string; studentId:string; realName:string };
export function parseParticipantRows(table: unknown[][]): ParticipantRow[] {
  const aliases:Record<string,keyof ParticipantRow>={账号:'username',用户名:'username',登录账号:'username',username:'username',学号:'studentId',studentid:'studentId',姓名:'realName',真实姓名:'realName',realname:'realName'};
  const fields=(table[0]||[]).map(cell=>{
    const key=String(cell??'').replace(/^\uFEFF/,'').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:undefined;
  });
  const recognized=fields.filter(Boolean);
  if(!recognized.some(f=>f==='username'||f==='studentId'))throw new Error('表头需包含“账号”或“学号”，校赛还需“姓名”');
  if(new Set(recognized).size!==recognized.length)throw new Error('账号、学号或姓名列重复，请检查表头');
  const rows:ParticipantRow[]=[];
  for(const cells of table.slice(1)){
    if(cells.every(cell=>!String(cell??'').trim()))continue;
    const row:ParticipantRow={username:'',studentId:'',realName:''};
    fields.forEach((field,index)=>{if(field)row[field]=String(cells[index]??'').trim();});
    rows.push(row);
  }
  if(!rows.length||rows.length>500)throw new Error('每次请导入 1～500 行，超过时请分批上传');
  return rows;
}
