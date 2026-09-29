import { Test } from '@nestjs/testing';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

class TestJwtStrategy extends PassportStrategy(Strategy) {
  constructor(){super({jwtFromRequest:ExtractJwt.fromAuthHeaderAsBearerToken(),secretOrKey:'test-only'});}
  validate(payload: any){return {id:payload.sub,role:'STUDENT'};}
}
describe('contest read HTTP authentication',()=>{
  let app:any;
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[PassportModule],controllers:[ContestController],providers:[
      TestJwtStrategy,{provide:ContestService,useValue:{
        getContest:jest.fn().mockResolvedValue({state:'ENDED'}),
        standings:jest.fn().mockResolvedValue({rows:[]}),
        contestSubmissions:jest.fn().mockResolvedValue({items:[]}),
        contestSubmissionDetail:jest.fn().mockResolvedValue({sourceCode:'code'}),
      }},
    ]}).compile();app=module.createNestApplication();await app.init();
  });
  afterAll(async()=>app?.close());
  it.each(['','/standings','/submissions','/submissions/s'])('passes anonymous %s reads to time-aware service authorization',async path=>{
    await request(app.getHttpServer()).get('/api/contests/c'+path).expect(200);
  });
  it.each(['/register','/submit','/virtual','/snapshot','/participants/import'])('keeps write route %s authenticated',async path=>{
    await request(app.getHttpServer()).post('/api/contests/c'+path).send({}).expect(401);
  });
});
