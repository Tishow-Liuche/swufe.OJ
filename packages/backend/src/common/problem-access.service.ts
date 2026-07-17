import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const PROBLEM_ACTIONS = [
  'EDIT',
  'MANAGE_TESTDATA',
  'MANAGE_CHECKER',
  'PUBLISH',
  'DELETE',
  'MANAGE',
] as const;

export type ProblemAction = (typeof PROBLEM_ACTIONS)[number];

export interface ProblemActor {
  id: string;
  role: string;
}

@Injectable()
export class ProblemAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanManage(problemId: string, actor: ProblemActor, action: ProblemAction) {
    const problem = await this.findProblem(problemId);

    if (actor.role === 'ADMIN' || problem.createdById === actor.id) {
      return problem;
    }

    // Historical records have no owner. Keep them admin-only until an
    // administrator explicitly assigns one, regardless of stale grants.
    if (!problem.createdById) throw new ForbiddenException('无权管理该题目');

    const delegated = problem.permissions.some((permission) => (
      permission.targetType === 'USER'
      && permission.targetId === actor.id
      && (permission.permission === 'MANAGE' || permission.permission === action)
    ));
    if (!delegated) throw new ForbiddenException('无权管理该题目');

    return problem;
  }

  async assertCanChangePermissions(problemId: string, actor: ProblemActor) {
    const problem = await this.findProblem(problemId);
    if (actor.role === 'ADMIN' || problem.createdById === actor.id) {
      return problem;
    }
    throw new ForbiddenException('只有题目创建者或管理员可以管理委派权限');
  }

  private async findProblem(problemId: string) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        createdById: true,
        permissions: {
          select: { targetType: true, targetId: true, permission: true },
        },
      },
    });
    if (!problem) throw new NotFoundException('题目不存在');
    return problem;
  }
}
