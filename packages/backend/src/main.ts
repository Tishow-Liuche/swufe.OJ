import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, extname } from 'path';
import { readFileSync } from 'fs';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const frontendPath = join(process.cwd(), '..', 'frontend', 'dist');
  const expressApp = app.getHttpAdapter().getInstance();

  // 全局缓存控制头 — 开发阶段禁用所有缓存
  expressApp.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // API 优先 → 静态文件 → SPA fallback
  expressApp.use((req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url;
    if (url.startsWith('/api/')) return next();

    const ext = extname(url);
    // 静态资源（有扩展名）走 express.static
    if (ext) return next();

    // SPA fallback：返回 index.html
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(readFileSync(join(frontendPath, 'index.html'), 'utf-8'));
  });

  // 静态文件中间件放在最后（有扩展名才到这里）
  const express = require('express');
  expressApp.use(express.static(frontendPath));

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`\n  🚀  西财 OJ → http://localhost:${port}\n`);
}
bootstrap();
