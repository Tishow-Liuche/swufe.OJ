import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

type StudentImportRow = {
  studentId: string;
  name: string;
  college?: string;
  phone: string;
  email: string;
};

@Injectable()
export class TeacherService {
  constructor(private prisma: PrismaService) {}

  // ========== 班级管理 ==========

  async getClasses(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      include: { _count: { select: { members: { where: { status: 'APPROVED' } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return classes.map(({ _count, ...cls }) => ({
      ...cls,
      memberCount: _count?.members ?? 0,
    }));
  }

  async createClass(teacherId: string, data: { name: string; courseId?: string }) {
    return this.prisma.class.create({
      data: { name: data.name, teacherId },
    });
  }

  async importStudents(classId: string, teacherId: string, students: StudentImportRow[] | string[]) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('No permission for this class');
    if (!Array.isArray(students) || !students.length) throw new BadRequestException('Import at least one student');
    if (students.length > 500) throw new BadRequestException('At most 500 students can be imported at a time');

    if (typeof students[0] === 'string') {
      let added = 0;
      const approvedUserIds: string[] = [];
      const notFound: string[] = [];
      const alreadyInClass: string[] = [];
      const duplicatedInput: string[] = [];
      const invalidRole: string[] = [];
      const seen = new Set<string>();

      for (const rawIdentifier of students as string[]) {
        const identifier = String(rawIdentifier || '').trim();
        if (!identifier) continue;
        const normalized = identifier.toLowerCase();
        if (seen.has(normalized)) {
          duplicatedInput.push(identifier);
          continue;
        }
        seen.add(normalized);

        const user = await this.prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: identifier, mode: 'insensitive' } },
              { email: { equals: identifier, mode: 'insensitive' } },
            ],
          },
          select: { id: true, username: true, email: true, role: true },
        });
        if (!user) {
          notFound.push(identifier);
          continue;
        }
        if (user.role !== 'STUDENT') {
          invalidRole.push(identifier);
          continue;
        }
        const existing = await this.prisma.classMember.findUnique({
          where: { classId_userId: { classId, userId: user.id } },
        });
        if (existing) {
          if (existing.status === 'APPROVED') {
            alreadyInClass.push(identifier);
            continue;
          }
          await this.prisma.classMember.update({
            where: { classId_userId: { classId, userId: user.id } },
            data: { status: 'APPROVED', reviewNote: null, reviewedAt: new Date() },
          });
          approvedUserIds.push(user.id);
          added++;
          continue;
        }
        await this.prisma.classMember.create({ data: { classId, userId: user.id } });
        approvedUserIds.push(user.id);
        added++;
      }
      await this.enrollStudentsInExistingAssignments(classId, approvedUserIds);
      return {
        added,
        skipped: notFound.length + alreadyInClass.length + duplicatedInput.length + invalidRole.length,
        notFound,
        alreadyInClass,
        duplicatedInput,
        invalidRole,
      };
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const approvedUserIds: string[] = [];
    const errors: Array<{ row: number; studentId: string; reason: string }> = [];
    const seen = new Set<string>();

    const rows = students as StudentImportRow[];
    for (const [index, raw] of rows.entries()) {
      const row = index + 2;
      const studentId = String(raw.studentId || '').trim();
      const name = String(raw.name || '').trim();
      const college = String(raw.college || '').trim();
      const phone = String(raw.phone || '').trim();
      const email = String(raw.email || '').trim().toLowerCase();

      if (!/^\d{8}$/.test(studentId)) { errors.push({ row, studentId, reason: '学号必须为 8 位数字' }); skipped++; continue; }
      if (!name || name.length > 40) { errors.push({ row, studentId, reason: '姓名不能为空且不能超过 40 个字符' }); skipped++; continue; }
      if (college.length > 80) { errors.push({ row, studentId, reason: '学院不能超过 80 个字符' }); skipped++; continue; }
      if (!/^1\d{10}$/.test(phone)) { errors.push({ row, studentId, reason: '手机号必须为 11 位大陆号码' }); skipped++; continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row, studentId, reason: '邮箱格式不正确' }); skipped++; continue; }
      if (seen.has(studentId)) { errors.push({ row, studentId, reason: '文件内学号重复' }); skipped++; continue; }
      seen.add(studentId);

      const existingUser = await this.prisma.user.findUnique({ where: { username: studentId } });
      const emailOwner = await this.prisma.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== existingUser?.id) {
        errors.push({ row, studentId, reason: 'email already belongs to another account' }); skipped++; continue;
      }
      if (existingUser && existingUser.role !== 'STUDENT') {
        errors.push({ row, studentId, reason: 'studentId is occupied by a non-student account' }); skipped++; continue;
      }

      const accountData = {
        email,
        nickname: name,
        studentId,
        phone,
        school: '西南财经大学',
        ...(college ? { college } : {}),
      };
      const user = existingUser
        ? await this.prisma.user.update({ where: { id: existingUser.id }, data: accountData })
        : await this.prisma.user.create({
            data: {
              username: studentId,
              password: await bcrypt.hash(studentId, 10),
              role: 'STUDENT',
              requestedRole: 'STUDENT',
              mustChangePassword: true,
              ...accountData,
            },
          });

      const member = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId: user.id } } });
      if (!member) {
        await this.prisma.classMember.create({ data: { classId, userId: user.id } });
        approvedUserIds.push(user.id);
        added++;
      }
      else {
        await this.prisma.classMember.update({
          where: { classId_userId: { classId, userId: user.id } },
          data: { status: 'APPROVED', reviewNote: null, reviewedAt: new Date() },
        });
        approvedUserIds.push(user.id);
        updated++;
      }
    }

    await this.enrollStudentsInExistingAssignments(classId, approvedUserIds);
    return { added, updated, skipped, errors };
  }
  async getClassMembers(classId: string, teacherId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');
    return this.prisma.classMember.findMany({
      where: { classId },
      include: { user: { select: { id: true, username: true, nickname: true } } },
      orderBy: [{ status: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async setJoinCode(classId: string, teacherId: string, expiresAtInput: string) {
    const cls = await this.requireOwnedClass(classId, teacherId);
    if (cls.status !== 'APPROVED') {
      throw new BadRequestException('班级通过管理员审核后才能启用班级码');
    }

    const expiresAt = new Date(expiresAtInput);
    if (!expiresAtInput || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new BadRequestException('班级码有效期必须晚于当前时间');
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const joinCode = this.generateJoinCode();
      const existing = await this.prisma.class.findUnique({ where: { joinCode }, select: { id: true } });
      if (existing) continue;
      return this.prisma.class.update({
        where: { id: classId },
        data: { joinCode, joinCodeExpiresAt: expiresAt },
        select: { id: true, joinCode: true, joinCodeExpiresAt: true },
      });
    }
    throw new BadRequestException('班级码生成失败，请稍后重试');
  }

  async disableJoinCode(classId: string, teacherId: string) {
    await this.requireOwnedClass(classId, teacherId);
    return this.prisma.class.update({
      where: { id: classId },
      data: { joinCode: null, joinCodeExpiresAt: null },
      select: { id: true, joinCode: true, joinCodeExpiresAt: true },
    });
  }

  async reviewMember(classId: string, teacherId: string, userId: string, status: string, reviewNote?: string) {
    await this.requireOwnedClass(classId, teacherId);
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('审核状态必须为 APPROVED 或 REJECTED');
    }

    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!member) throw new NotFoundException('未找到该学生的入班申请');
    if (member.status !== 'PENDING') throw new BadRequestException('该申请已处理');

    const updated = await this.prisma.classMember.update({
      where: { classId_userId: { classId, userId } },
      data: {
        status,
        reviewNote: reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
      include: { user: { select: { id: true, username: true, nickname: true } } },
    });

    if (status === 'APPROVED') {
      const assignments = await this.prisma.assignment.findMany({
        where: { classId },
        select: { id: true },
      });
      if (assignments.length) {
        await this.prisma.assignmentStudent.createMany({
          data: assignments.map((assignment) => ({ assignmentId: assignment.id, userId })),
          skipDuplicates: true,
        });
      }
    }
    return updated;
  }

  async removeStudent(classId: string, teacherId: string, userId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');

    const member = await this.prisma.classMember.findUnique({
      where: { classId_userId: { classId, userId } },
    });
    if (!member) throw new NotFoundException('该学生不在此班级中');

    await this.prisma.classMember.delete({
      where: { classId_userId: { classId, userId } },
    });
    return { removed: true };
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
    if (!cls) throw new NotFoundException('?????');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('???????');

    const problemIds = [...new Set((data.problemIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!data.title?.trim()) throw new BadRequestException('????????');
    if (!problemIds.length) throw new BadRequestException('?????????');

    const problems = await this.prisma.problem.findMany({
      where: { id: { in: problemIds }, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (problems.length !== problemIds.length) {
      throw new BadRequestException('????????????');
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        classId: data.classId,
        title: data.title.trim(),
        description: data.description || '',
        startTime: data.startTime ? new Date(data.startTime) : new Date(),
        endTime: data.endTime ? new Date(data.endTime) : new Date(Date.now() + 7 * 86400000),
      },
    });

    await this.prisma.assignmentProblem.createMany({
      data: problemIds.map((pid, i) => ({
        assignmentId: assignment.id, problemId: pid, order: i + 1, score: 100,
      })),
      skipDuplicates: true,
    });

    const members = await this.prisma.classMember.findMany({
      where: { classId: data.classId, status: 'APPROVED' },
      select: { userId: true },
    });
    if (members.length) {
      await this.prisma.assignmentStudent.createMany({
        data: members.map((member) => ({ assignmentId: assignment.id, userId: member.userId })),
        skipDuplicates: true,
      });
    }

    return assignment;
  }

  async getClassAssignments(teacherId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('?????');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('???????');

    return this.prisma.assignment.findMany({
      where: { classId },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: { problem: { select: { id: true, title: true, source: true, difficulty: true } } },
        },
        _count: { select: { students: true, problems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignmentReport(teacherId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: { problem: { select: { id: true, title: true, source: true, difficulty: true } } },
        },
      },
    });
    if (!assignment) throw new NotFoundException('?????');

    const cls = await this.prisma.class.findUnique({ where: { id: assignment.classId } });
    if (!cls) throw new NotFoundException('?????');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('???????');

    const classMembers = await this.prisma.classMember.findMany({
      where: { classId: assignment.classId, status: 'APPROVED' },
      include: { user: { select: { id: true, username: true, nickname: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const studentIds = classMembers.map((member) => member.user.id);
    const problemIds = assignment.problems.map((item) => item.problem.id);

    const submissions = await this.prisma.submission.findMany({
      where: {
        userId: { in: studentIds },
        problemId: { in: problemIds },
        createdAt: { gte: assignment.startTime, lte: assignment.endTime },
      },
      select: {
        id: true,
        userId: true,
        problemId: true,
        status: true,
        score: true,
        timeUsed: true,
        memoryUsed: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const byStudentProblem = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const key = submission.userId + ':' + submission.problemId;
      const bucket = byStudentProblem.get(key) || [];
      bucket.push(submission);
      byStudentProblem.set(key, bucket);
    }

    const students = classMembers.map((member) => {
      let solvedCount = 0;
      const problemStatuses = assignment.problems.map((item) => {
        const problem = item.problem;
        const attempts = byStudentProblem.get(member.user.id + ':' + problem.id) || [];
        const accepted = attempts.find((submission) => submission.status === 'ACCEPTED');
        const best = accepted || attempts[0];
        if (accepted) solvedCount++;
        return {
          problemId: problem.id,
          title: problem.title,
          status: best ? best.status : 'NOT_SUBMITTED',
          attempts: attempts.length,
          bestSubmissionId: best?.id || null,
          score: best?.score ?? 0,
          timeUsed: best?.timeUsed ?? null,
          memoryUsed: best?.memoryUsed ?? null,
          submittedAt: best?.createdAt ?? null,
        };
      });

      return {
        user: member.user,
        solvedCount,
        totalProblems: assignment.problems.length,
        completed: solvedCount === assignment.problems.length && assignment.problems.length > 0,
        problems: problemStatuses,
      };
    });

    return {
      assignment: {
        id: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        description: assignment.description,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
      },
      class: { id: cls.id, name: cls.name },
      problems: assignment.problems.map((item) => item.problem),
      students,
      summary: {
        studentCount: students.length,
        problemCount: assignment.problems.length,
        completedStudents: students.filter((student) => student.completed).length,
      },
    };
  }

  // ========== ???? ==========

  async getContests(teacherId: string) {
    return this.prisma.contest.findMany({
      where: { createdBy: teacherId },
      include: { _count: { select: { problems: true, participants: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContest(actor: string | { id: string; role?: string }, data: {
    title: string; description?: string; mode?: string;
    startTime: string; endTime: string; problemIds?: string[];
    visibility?: string; registerStart?: string; registerEnd?: string;
    freezeTime?: string; allowUpsolve?: boolean; maxSubmissions?: number;
    penaltyTime?: number; password?: string; teamMode?: boolean; isRated?: boolean;
  }) {
    const teacherId = typeof actor === 'string' ? actor : actor.id;
    const isAdmin = typeof actor !== 'string' && actor.role === 'ADMIN';
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      throw new ForbiddenException('比赛结束时间必须晚于开始时间');
    }
    const problemIds = [...new Set((data.problemIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (problemIds.length) {
      const reservedProblemWhere: any = {
        id: { in: problemIds },
        source: 'LOCAL',
        status: 'CONTEST_RESERVED',
      };
      if (!isAdmin) reservedProblemWhere.createdById = teacherId;
      const reservedProblems = await this.prisma.problem.findMany({
        where: reservedProblemWhere,
        select: { id: true },
      });
      if (reservedProblems.length !== problemIds.length) {
        throw new BadRequestException('比赛只能选择自己录入的比赛预备题库题目');
      }
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
        teamMode: data.teamMode ?? false,
        isRated: data.isRated ?? false,
        createdBy: teacherId,
      },
    });

    if (problemIds.length) {
      await this.prisma.contestProblem.createMany({
        data: problemIds.map((pid, i) => ({
          contestId: contest.id, problemId: pid, order: i + 1, score: 100,
        })),
      });
    }

    return contest;
  }

  private async requireOwnedClass(classId: string, teacherId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');
    return cls;
  }

  private generateJoinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  }

  private async enrollStudentsInExistingAssignments(classId: string, userIds: string[]) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueUserIds.length) return;

    const assignments = await this.prisma.assignment.findMany({
      where: { classId },
      select: { id: true },
    });
    if (!Array.isArray(assignments) || !assignments.length) return;

    await this.prisma.assignmentStudent.createMany({
      data: assignments.flatMap((assignment) =>
        uniqueUserIds.map((userId) => ({ assignmentId: assignment.id, userId })),
      ),
      skipDuplicates: true,
    });
  }
}
