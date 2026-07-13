import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
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

  // 托管前端静态文件（构建产物）
  const frontendPath = join(process.cwd(), '..', 'frontend', 'dist');
  app.useStaticAssets(frontendPath, { index: 'index.html' });

  // SPA fallback：非 API 路由返回 index.html
  const expressApp = app.getHttpAdapter().getInstance();
  const express = require('express');
  expressApp.use((req: any, res: any, next: any) => {
    if (req.url.startsWith('/api/')) return next();
    // 无扩展名 = SPA 路由，返回 index.html
    if (!join(frontendPath, req.url).includes('.')) {
      return res.sendFile(join(frontendPath, 'index.html'));
    }
    next();
  });

  // 静态文件
  expressApp.use(express.static(frontendPath));

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`\n  🚀  西财 OJ → http://localhost:${port}\n`);
}
bootstrap();
