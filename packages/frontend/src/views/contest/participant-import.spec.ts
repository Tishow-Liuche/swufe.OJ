import {expect,it} from 'vitest';
import {parseParticipantRows} from './participant-import';
it('ignores inherited object property names in headers',()=>{
  const rows=parseParticipantRows([['账号','constructor','__proto__'],['alice','ignored','ignored']]);
  expect(Object.keys(rows[0]!)).toEqual(['username','studentId','realName']);
});
it('maps Chinese headers and preserves text student IDs',()=>{
  expect(parseParticipantRows([['账号','学号','姓名'],['alice','00123456','张三']])).toEqual([{username:'alice',studentId:'00123456',realName:'张三'}]);
});
it('supports student-ID-only rows and ignores empty rows',()=>{
  expect(parseParticipantRows([['studentId','realName'],['42411036','同学'],['','']])).toHaveLength(1);
});
it('rejects unsupported headers, duplicate fields and oversized batches',()=>{
  expect(()=>parseParticipantRows([['昵称'],['alice']])).toThrow();
  expect(()=>parseParticipantRows([['账号','username'],['a','b']])).toThrow();
  expect(()=>parseParticipantRows([['账号'],...Array(501).fill(['alice'])])).toThrow();
});
