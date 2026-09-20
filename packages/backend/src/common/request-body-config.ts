import { json, urlencoded, type Express, type RequestHandler, type ErrorRequestHandler } from 'express';

export function configureRequestBodies(app: Pick<Express, 'use'>) {
  const normal = json({ limit: '100kb' });
  const authoring = json({ limit: '16mb' });
  const select: RequestHandler = (req, res, next) => {
    const large = (req.method === 'POST' && /^\/api\/problems\/?$/i.test(req.path)) ||
      (req.method === 'PATCH' && /^\/api\/problems\/[^/]+\/?$/i.test(req.path));
    (large ? authoring : normal)(req, res, (error?: any) => {
      if (error?.type === 'entity.too.large') {
        res.status(413).json({ statusCode: 413, message: large
          ? '录题表单超过 16 MiB，请将大测试数据通过 ZIP 上传，不要粘贴到题面或样例中'
          : '请求内容超过 100 KiB 限制' });
        return;
      }
      next(error);
    });
  };
  const errors: ErrorRequestHandler = (error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ statusCode: 413, message: '请求内容超过 100 KiB 限制' });
    } else next(error);
  };
  app.use(select, urlencoded({ extended: true, limit: '100kb' }), errors);
}
