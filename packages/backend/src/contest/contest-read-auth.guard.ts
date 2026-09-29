import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Only for read endpoints whose service checks official contest end time. */
@Injectable()
export class ContestReadAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err) throw err;
    return user || undefined;
  }
}
