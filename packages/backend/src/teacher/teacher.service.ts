import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  // ========== 班级管理 ==========

  async getClasses(teacherId: string) {
    return this.prisma.class.findMany({
      where: { teacherId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createClass(teacherId: string, data: { name: string; courseId?: string }) {
    return this.prisma.class.create({
      data: { name: data.name, teacherId },
    });
  }

  async importStudents(classId: string, teacherId: string, usernames: string[]) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');

    let added = 0, skipped = 0;
    for (const username of usernames) {
      const user = await this.prisma.user.findUnique({ where: { username } });
      if (!user) { skipped++; continue; }
      const existing = await this.prisma.classMember.findUnique({
        where: { classId_userId: { classId, userId: user.id } },
      });
      if (existing) { skipped++; continue; }
      await this.prisma.classMember.create({ data: { classId, userId: user.id } });
      added++;
    }
    return { added, skipped };
  }

  async getClassMembers(classId: string, teacherId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');
    return this.prisma.classMember.findMany({
      where: { classId },
      include: { user: { select: { id: true, username: true, nickname: true } } },
    });
  }

  // ========== 作业管理 ==========

  async getAssignments(teacherId: string) {
    // 先获取教师的所有班级 ID
    const classIds = (await this.prisma.class.findMany({
      where: { teacherId },
      select: { id: true, name: true },
    }));
    const ids = classIds.map(c => c.id);

    return this.prisma.assignment.findMany({
      where: { classId: { in: ids } },
      include: {
        _count: { select: { problems: true, students: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAssignment(teacherId: string, data: {
    classId: string; title: string; description?: string;
    startTime?: string; endTime?: string; problemIds?: string[];
  }) {
    const cls = await this.prisma.class.findUnique({ where: { id: data.classId } });
    if (!cls || cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');

    const assignment = await this.prisma.assignment.create({
      data: {
        classId: data.classId,
        title: data.title,
        description: data.description || '',
        startTime: data.startTime ? new Date(data.startTime) : new Date(),
        endTime: data.endTime ? new Date(data.endTime) : new Date(Date.now() + 7 * 86400000),
      },
    });

    if (data.problemIds?.length) {
      await this.prisma.assignmentProblem.createMany({
        data: data.problemIds.map((pid, i) => ({
          assignmentId: assignment.id, problemId: pid, order: i + 1, score: 100,
        })),
      });
    }

    return assignment;
  }

  // ========== 比赛管理 ==========

  async getContests(teacherId: string) {
    return this.prisma.contest.findMany({
      where: { createdBy: teacherId },
      include: { _count: { select: { problems: true, participants: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContest(teacherId: string, data: {
    title: string; description?: string; mode?: string;
    startTime: string; endTime: string; problemIds?: string[];
    visibility?: string; registerStart?: string; registerEnd?: string;
    freezeTime?: string; allowUpsolve?: boolean; maxSubmissions?: number;
    penaltyTime?: number; password?: string;
  }) {
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      throw new ForbiddenException('比赛结束时间必须晚于开始时间');
    }
    const contest = await this.prisma.contest.create({
      data: {
        title: data.title,
        description: data.description || '',
        mode: data.mode || 'ACM',
        visibility: data.visibility || 'PUBLIC',
        password: data.password || null,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        registerStart: data.registerStart ? new Date(data.registerStart) : null,
        registerEnd: data.registerEnd ? new Date(data.registerEnd) : null,
        freezeTime: data.freezeTime ? new Date(data.freezeTime) : null,
        allowUpsolve: data.allowUpsolve ?? true,
        maxSubmissions: data.maxSubmissions || null,
        penaltyTime: data.penaltyTime || 20,
        createdBy: teacherId,
      },
    });

    if (data.problemIds?.length) {
      await this.prisma.contestProblem.createMany({
        data: data.problemIds.map((pid, i) => ({
          contestId: contest.id, problemId: pid, order: i + 1, score: 100,
        })),
      });
    }

    return contest;
  }
}
