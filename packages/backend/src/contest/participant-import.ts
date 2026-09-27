import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type ImportRow = { username: string; studentId: string; realName: string; malformed: boolean };
type RowResult = { row: number; username: string; studentId: string; status: 'imported'|'skipped'|'invalid'; message: string };

export async function importContestParticipants(db: PrismaService, contestId: string, actor: {id:string;role?:string}, body: unknown) {
  if(actor.role !== 'ADMIN') throw new ForbiddenException('只有管理员可以补录参赛者');
  const raw = (body as any)?.rows;
  if(!Array.isArray(raw) || raw.length<1 || raw.length>500) throw new BadRequestException('每次请导入 1～500 行参赛者');
  const rows:ImportRow[]=raw.map(value=>{
    const malformed=!value || typeof value!=='object' || Array.isArray(value)
      || ['username','studentId','realName'].some(key=>value[key]!==undefined && (typeof value[key]!=='string'||value[key].length>100));
    return {username:typeof value?.username==='string'?value.username.trim().slice(0,100):'',
      studentId:typeof value?.studentId==='string'?value.studentId.trim().slice(0,100):'',
      realName:typeof value?.realName==='string'?value.realName.trim().slice(0,100):'',malformed};
  });
  return db.$transaction(async tx=>{
    const contest=await tx.contest.findUnique({where:{id:contestId}});
    if(!contest) throw new NotFoundException('比赛不存在');
    const assertOpen=()=>{if(contest.endTime.getTime()<=Date.now())throw new BadRequestException('比赛已结束，不能补录参赛者');};
    assertOpen();
    const users=await tx.user.findMany({where:{deletedAt:null,OR:[
      {username:{in:rows.filter(r=>!r.malformed&&r.username).map(r=>r.username)}},
      {studentId:{in:rows.filter(r=>!r.malformed&&r.studentId).map(r=>r.studentId)}},
    ]},select:{id:true,username:true,studentId:true}});
    const byName=new Map(users.map(u=>[u.username,u]));
    const byStudent=new Map(users.filter(u=>u.studentId).map(u=>[u.studentId!,u]));
    const existing=await tx.contestParticipant.findMany({where:{contestId,userId:{in:users.map(u=>u.id)}},select:{userId:true}});
    const seen=new Set(existing.map(p=>p.userId));
    const pending:Array<{id:string;contestId:string;userId:string;isVirtual:boolean;studentId?:string;realName?:string}>=[];
    const pendingRows=new Map<string,RowResult>();
    const results:RowResult[]=rows.map((row,index)=>{
      const result:RowResult={row:index+1,username:row.username,studentId:row.studentId,status:'invalid',message:''};
      const fail=(message:string)=>{result.message=message;return result;};
      if(row.malformed || (!row.username&&!row.studentId))return fail('请填写账号或绑定学号，且字段必须为文本');
      const user=row.username?byName.get(row.username):byStudent.get(row.studentId);
      if(!user)return fail('账号不存在、已停用或学号未绑定');
      if(row.studentId && row.studentId!==user.studentId)return fail('账号与绑定学号不匹配');
      result.username=user.username;result.studentId=user.studentId||'';
      if(seen.has(user.id)){result.status='skipped';return fail('已报名或本批次重复，保留原记录');}
      if(contest.visibility==='CAMPUS_PRIVATE'){
        if(!user.studentId)return fail('校赛参赛者须先绑定学号');
        if(!row.realName || row.realName.length>40 || /[\p{Cc}_]/u.test(row.realName))return fail('校赛须填写真实姓名（1～40字，不含下划线或控制字符）');
      }
      seen.add(user.id);
      const id=randomUUID();
      pending.push({id,contestId,userId:user.id,isVirtual:false,...(contest.visibility==='CAMPUS_PRIVATE'?{studentId:user.studentId!,realName:row.realName}:{})});
      pendingRows.set(id,result);
      return result;
    });
    if(pending.length){
      assertOpen();
      await tx.contestParticipant.createMany({data:pending,skipDuplicates:true});
      const inserted=await tx.contestParticipant.findMany({where:{id:{in:pending.map(p=>p.id)}},select:{id:true}});
      const insertedIds=new Set(inserted.map(p=>p.id));
      for(const [id,result] of pendingRows){
        result.status=insertedIds.has(id)?'imported':'skipped';
        result.message=result.status==='imported'?'补录成功':'已报名，保留原记录';
      }
    }
    assertOpen();
    return {imported:results.filter(r=>r.status==='imported').length,skipped:results.filter(r=>r.status==='skipped').length,
      invalid:results.filter(r=>r.status==='invalid').length,results};
  },{timeout:15000});
}
