import { CallHandler, ExecutionContext, Injectable, NestInterceptor, HttpException, HttpStatus } from '@nestjs/common';
import { finalize } from 'rxjs';
import { unlink } from 'node:fs/promises';

/** Admit before Multer consumes the request body. No unbounded import queue. */
@Injectable()
export class TestdataImportInterceptor implements NestInterceptor {
  private static active = false;
  intercept(context: ExecutionContext, next: CallHandler) {
    if (TestdataImportInterceptor.active) throw new HttpException('已有测试数据正在导入，请等待完成后再上传', HttpStatus.TOO_MANY_REQUESTS);
    TestdataImportInterceptor.active = true;
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(finalize(() => {
      TestdataImportInterceptor.active = false;
      if (request.file?.path) void unlink(request.file.path).catch(() => {});
    }));
  }
}
