import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, extname } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 托管前端 — 全部在 3000 端口，零跨域
  const expressApp = app.getHttpAdapter().getInstance();
  // process.cwd() = packages/backend (npm run 目录)
  const frontendPath = join(process.cwd(), '..', 'frontend', 'dist');
  console.log('  📁 前端目录:', frontendPath);

  // ① 先处理 API 路由
  // ② 静态文件（JS/CSS/图片等有扩展名的）
  // ③ SPA 回退（无扩展名 → index.html）

  expressApp.use((req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url;
    // API 请求交给 NestJS
    if (url.startsWith('/api/')) return next();
    // 有扩展名的请求尝试静态文件，找不到再回退
    const hasExt = extname(url);
    if (!hasExt) {
      return res.sendFile(join(frontendPath, 'index.html'));
    }
    next();
  });

  // 静态文件中间件
  const express = require('express');
  expressApp.use(express.static(frontendPath));

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`\n  🚀  西财 OJ → http://localhost:${port}\n`);
}
bootstrap();
