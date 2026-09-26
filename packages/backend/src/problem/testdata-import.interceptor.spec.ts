import { Subject, of, throwError, lastValueFrom } from 'rxjs';
import { TestdataImportInterceptor } from './testdata-import.interceptor';
import { mkdtemp, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('rejects a second importer and releases admission after failure', async () => {
  const interceptor=new TestdataImportInterceptor();const source=new Subject();
  const context:any={switchToHttp:()=>({getRequest:()=>({})})};
  const sub=interceptor.intercept(context,{handle:()=>source}).subscribe({error:()=>{}});
  expect(()=>interceptor.intercept(context,{handle:()=>of(1)})).toThrow('正在导入');
  source.error(new Error('bad zip'));sub.unsubscribe();
  expect(await lastValueFrom(interceptor.intercept(context,{handle:()=>of(1)}))).toBe(1);
});
it('removes the disk upload when downstream processing fails', async () => {
  const dir=await mkdtemp(join(tmpdir(),'oj-upload-test-'));const path=join(dir,'fixture');await writeFile(path,'zip');
  try {
    const context:any={switchToHttp:()=>({getRequest:()=>({file:{path}})})};
    await expect(lastValueFrom(new TestdataImportInterceptor().intercept(context,{handle:()=>throwError(()=>new Error('bad zip'))}))).rejects.toThrow('bad zip');
    for(let i=0;i<20;i++){try{await stat(path);await new Promise(r=>setTimeout(r,5));}catch{return;}}
    throw Error('temporary file not removed');
  } finally {await rm(dir,{recursive:true,force:true});}
});
