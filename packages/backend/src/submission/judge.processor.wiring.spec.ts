import 'reflect-metadata';
import { JudgeService } from '../judge/judge.service';
import { JudgeProcessor } from './judge.processor';

describe('JudgeProcessor production wiring', () => {
  it('injects the isolated JudgeService instead of the native executor', () => {
    const dependencies = Reflect.getMetadata('design:paramtypes', JudgeProcessor);

    expect(dependencies[1]).toBe(JudgeService);
  });
});
