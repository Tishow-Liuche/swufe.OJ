import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // 没有 @Roles 装饰器 → 放行（由 AuthGuard 或其他守卫处理认证）
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    // 有 @Roles 但没有 user → 拒绝（说明没有经过 AuthGuard）
    if (!user || !user.role) return false;

    return requiredRoles.includes(user.role);
  }
}
