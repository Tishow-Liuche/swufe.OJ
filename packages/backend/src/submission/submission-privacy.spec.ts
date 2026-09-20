import { SubmissionController } from './submission.controller';
import { ContestService } from '../contest/contest.service';
import { ContestStandingsCalculatorService } from '../contest/contest-standings-calculator.service';
const submission = { id:'s1', userId:'u1', sourceCode:'code', status:'SYSTEM_ERROR', compileMessage:'SPJ stderr: hidden input 123456', cases:[{caseIndex:1,status:'SYSTEM_ERROR',input:'123456',actualOutput:'123456',timeUsed:1,memoryUsed:2}] };
describe('judge diagnostic privacy',()=>{
  it('does not expose checker internals to the submitting student',async()=>{
    const c=new SubmissionController({findOne:async()=>structuredClone(submission)} as any);
    const data=await c.findOne('s1',{user:{id:'u1',role:'STUDENT'}});
    expect(JSON.stringify(data)).not.toContain('123456');
    expect(data.sourceCode).toBe('code');
  });
  it('does not leak hidden test data in contest details',async()=>{
    const c=new ContestService({contest:{findUnique:async()=>({visibility:'PUBLIC',createdBy:'teacher',endTime:new Date(0),submissions:[{submission:structuredClone(submission)}]})}} as any,{} as any,new ContestStandingsCalculatorService());
    const data=await c.contestSubmissionDetail('c1','s1',{id:'u1',role:'STUDENT'});
    expect(JSON.stringify(data)).not.toContain('123456');
    expect(data.sourceCode).toBe('code');
  });
});
