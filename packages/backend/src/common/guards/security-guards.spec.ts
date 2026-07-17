import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProblemController } from '../../problem/problem.controller';
import { CfSyncController } from '../../sync/cf-sync.controller';
import { SyncController } from '../../sync/sync.controller';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function guardsOn(target: object) {
  return (Reflect.getMetadata(GUARDS_METADATA, target) || []) as unknown[];
}

describe('privileged controller guards', () => {
  it.each([
    'create',
    'uploadTestData',
    'uploadImage',
    'uploadChecker',
    'update',
    'delete',
    'updateStatus',
  ])('enforces role checks on ProblemController.%s', (method) => {
    const handler = ProblemController.prototype[method as keyof ProblemController] as object;
    expect(guardsOn(handler)).toContain(RolesGuard);
  });

  it.each([SyncController, CfSyncController])(
    'restricts %p to administrators',
    (controller) => {
      expect(guardsOn(controller)).toContain(RolesGuard);
      expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(['ADMIN']);
    },
  );
});
