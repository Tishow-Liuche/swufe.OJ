import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export function configureHttpSecurity(app: NestExpressApplication, config: ConfigService) {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const trustProxy = String(config.get('TRUST_PROXY', 'false')) === 'true';

  if (trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(cookieParser());
  app.use(helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            "base-uri": ["'self'"],
            "connect-src": ["'self'"],
            "default-src": ["'self'"],
            "font-src": ["'self'", 'data:'],
            "form-action": ["'self'"],
            "frame-ancestors": ["'self'"],
            "img-src": ["'self'", 'data:', 'https:'],
            "object-src": ["'none'"],
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "worker-src": ["'self'", 'blob:'],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
    hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  }));
}
