import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureHttpSecurity } from './common/security-config';
import { configureRequestBodies } from './common/request-body-config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  configureHttpSecurity(app, app.get(ConfigService));
  configureRequestBodies(app.getHttpAdapter().getInstance());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.APP_PORT || 3000;
  const host = process.env.APP_HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`SWUFE Singularity OJ API listening on http://${host}:${port}`);
}

bootstrap();
