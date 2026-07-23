import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { formatAssignmentDeadline } from './assignment-notification';
import {
  assignmentLifecycleLabel,
  buildAssignmentReportCsv,
  filterReportStudents,
  statusLabelZh,
} from './assignment-progress';
import { AssignmentProgressService } from './assignment-progress.service';
import { NotificationOutboxService } from './notification-outbox.service';

type StudentImportRow = {
  studentId: string;
  name: string;
  college?: string;
  phone: string;
  email: string;
};

type CreateAssignmentInput = {
  classId: string;
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  problemIds?: string[];
  allowLate?: boolean;
  latePenalty?: number;
  passCondition?: string | null;
  countExternalAc?: boolean;
};

type UpdateAssignmentInput = {
  title?: string;
  description?: string | null;
  startTime?: string;
  endTime?: string;
  allowLate?: boolean;
  latePenalty?: number;
  passCondition?: string | null;
  countExternalAc?: boolean;
  problemIds?: string[];
};

type ReportFilters = {
  status?: string;
  keyword?: string;
  completion?: 'all' | 'completed' | 'incomplete';
  refresh?: boolean;
};

@Injectable()
export class TeacherService {
  constructor(
    private prisma: PrismaService,
    private readonly assignmentProgress: AssignmentProgressService,
    private readonly notificationOutbox: NotificationOutboxService,
  ) {}

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
          data: assignments.map((assignment) => ({
            assignmentId: assignment.id,
            userId,
            status: 'NOT_STARTED',
            score: 0,
          })),
          skipDuplicates: true,
        });
        // Compute any pre-existing AC window progress for mid-join students.
        for (const assignment of assignments) {
          await this.assignmentProgress.recomputeStudent(assignment.id, userId);
        }
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

  async createAssignment(teacherId: string, data: CreateAssignmentInput) {
    const cls = await this.prisma.class.findUnique({ where: { id: data.classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');

    const problemIds = [...new Set((data.problemIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!data.title?.trim()) throw new BadRequestException('请填写作业标题');
    if (!problemIds.length) throw new BadRequestException('请至少选择一道题目');

    const startTime = data.startTime ? new Date(data.startTime) : new Date();
    const endTime = data.endTime ? new Date(data.endTime) : new Date(Date.now() + 7 * 86400000);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('开始或截止时间格式不正确');
    }
    if (endTime <= startTime) throw new BadRequestException('截止时间必须晚于开始时间');

    const latePenalty = data.latePenalty == null ? 0 : Number(data.latePenalty);
    if (!Number.isFinite(latePenalty) || latePenalty < 0 || latePenalty > 100) {
      throw new BadRequestException('迟交扣分比例须在 0–100 之间');
    }

    const problems = await this.prisma.problem.findMany({
      where: { id: { in: problemIds }, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (problems.length !== problemIds.length) {
      throw new BadRequestException('存在未发布或不存在的题目');
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        classId: data.classId,
        title: data.title.trim(),
        description: data.description || '',
        startTime,
        endTime,
        allowLate: Boolean(data.allowLate),
        latePenalty,
        passCondition: data.passCondition?.trim() || null,
        countExternalAc: Boolean(data.countExternalAc),
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
        data: members.map((member) => ({
          assignmentId: assignment.id,
          userId: member.userId,
          status: 'NOT_STARTED',
          score: 0,
        })),
        skipDuplicates: true,
      });
      // Delivery failure must not roll back the published assignment.
      await this.notificationOutbox.deliverMany(
        members.map((member) => ({
          userId: member.userId,
          type: 'ASSIGNMENT',
          title: `${cls.name} 发布了作业`,
          content: `${assignment.title} · 截止 ${formatAssignmentDeadline(assignment.endTime)}`,
          link: `/classes/${data.classId}/assignments?assignment=${assignment.id}`,
          refType: 'ASSIGNMENT',
          refId: assignment.id,
        })),
      );
    }

    return assignment;
  }

  async updateAssignment(teacherId: string, assignmentId: string, data: UpdateAssignmentInput) {
    const assignment = await this.requireOwnedAssignment(teacherId, assignmentId);

    const nextStart = data.startTime ? new Date(data.startTime) : assignment.startTime;
    const nextEnd = data.endTime ? new Date(data.endTime) : assignment.endTime;
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      throw new BadRequestException('开始或截止时间格式不正确');
    }
    if (nextEnd <= nextStart) throw new BadRequestException('截止时间必须晚于开始时间');

    let latePenalty = assignment.latePenalty;
    if (data.latePenalty !== undefined) {
      latePenalty = Number(data.latePenalty);
      if (!Number.isFinite(latePenalty) || latePenalty < 0 || latePenalty > 100) {
        throw new BadRequestException('迟交扣分比例须在 0–100 之间');
      }
    }

    if (data.problemIds) {
      const problemIds = [...new Set(data.problemIds.map((id) => String(id || '').trim()).filter(Boolean))];
      if (!problemIds.length) throw new BadRequestException('请至少保留一道题目');
      const problems = await this.prisma.problem.findMany({
        where: { id: { in: problemIds }, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (problems.length !== problemIds.length) {
        throw new BadRequestException('存在未发布或不存在的题目');
      }
      await this.prisma.assignmentProblem.deleteMany({ where: { assignmentId } });
      await this.prisma.assignmentProblem.createMany({
        data: problemIds.map((pid, i) => ({
          assignmentId, problemId: pid, order: i + 1, score: 100,
        })),
      });
    }

    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        title: data.title !== undefined ? data.title.trim() : undefined,
        description: data.description !== undefined ? data.description : undefined,
        startTime: data.startTime ? nextStart : undefined,
        endTime: data.endTime ? nextEnd : undefined,
        allowLate: data.allowLate !== undefined ? Boolean(data.allowLate) : undefined,
        latePenalty: data.latePenalty !== undefined ? latePenalty : undefined,
        passCondition: data.passCondition !== undefined ? (data.passCondition?.trim() || null) : undefined,
        countExternalAc: data.countExternalAc !== undefined ? Boolean(data.countExternalAc) : undefined,
      },
    });

    // Mid-way rule changes must recompute enrolled students (except SETTLED).
    await this.assignmentProgress.recomputeAssignment(assignmentId);
    return updated;
  }

  async deleteAssignment(teacherId: string, assignmentId: string) {
    await this.requireOwnedAssignment(teacherId, assignmentId);
    await this.prisma.assignment.delete({ where: { id: assignmentId } });
    return { ok: true, id: assignmentId };
  }

  async getClassAssignments(teacherId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');

    const assignments = await this.prisma.assignment.findMany({
      where: { classId },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                source: true,
                difficulty: true,
                sourceInfo: { select: { platform: true, remoteProblemId: true } },
                tags: { select: { name: true }, take: 6 },
              },
            },
          },
        },
        students: { select: { status: true, score: true, completedAt: true } },
        _count: { select: { students: true, problems: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return assignments.map((assignment) => {
      const completedStudents = assignment.students.filter((s) =>
        s.status === 'COMPLETED' || s.status === 'LATE' || s.status === 'SETTLED',
      ).length;
      return {
        id: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        description: assignment.description,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        allowLate: assignment.allowLate,
        latePenalty: assignment.latePenalty,
        passCondition: assignment.passCondition,
        countExternalAc: assignment.countExternalAc,
        problems: assignment.problems,
        _count: assignment._count,
        lifecycle: assignmentLifecycleLabel(
          assignment.startTime,
          assignment.endTime,
          now,
          assignment.allowLate,
        ),
        summary: {
          studentCount: assignment._count.students,
          problemCount: assignment._count.problems,
          completedStudents,
        },
      };
    });
  }

  async getAssignmentReport(teacherId: string, assignmentId: string, filters: ReportFilters = {}) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        problems: {
          orderBy: { order: 'asc' },
          include: { problem: { select: { id: true, title: true, source: true, difficulty: true } } },
        },
      },
    });
    if (!assignment) throw new NotFoundException('作业不存在');

    const cls = await this.prisma.class.findUnique({ where: { id: assignment.classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权查看该作业报告');

    // Ensure mid-join students are enrolled before reporting.
    await this.ensureApprovedMembersEnrolled(assignment.classId, assignmentId);

    if (filters.refresh !== false) {
      await this.assignmentProgress.recomputeAssignment(assignmentId);
    }

    const classMembers = await this.prisma.classMember.findMany({
      where: { classId: assignment.classId, status: 'APPROVED' },
      include: { user: { select: { id: true, username: true, nickname: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    const studentIds = classMembers.map((member) => member.user.id);
    const problemIds = assignment.problems.map((item) => item.problem.id);

    const submissionWindowEnd = assignment.allowLate
      ? undefined
      : assignment.endTime;
    const submissions = studentIds.length && problemIds.length
      ? await this.prisma.submission.findMany({
          where: {
            userId: { in: studentIds },
            problemId: { in: problemIds },
            createdAt: {
              gte: assignment.startTime,
              ...(submissionWindowEnd ? { lte: submissionWindowEnd } : {}),
            },
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
        })
      : [];

    const enrollmentRows = await this.prisma.assignmentStudent.findMany({
      where: { assignmentId },
    });
    const enrollmentByUser = new Map(enrollmentRows.map((row) => [row.userId, row]));

    const byStudentProblem = new Map<string, typeof submissions>();
    for (const submission of submissions) {
      const key = submission.userId + ':' + submission.problemId;
      const bucket = byStudentProblem.get(key) || [];
      bucket.push(submission);
      byStudentProblem.set(key, bucket);
    }

    const now = new Date();
    const students = [];
    for (const member of classMembers) {
      const progress = await this.assignmentProgress.calculate(
        {
          id: assignment.id,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          allowLate: assignment.allowLate,
          latePenalty: assignment.latePenalty,
          passCondition: assignment.passCondition,
          countExternalAc: assignment.countExternalAc,
          problems: assignment.problems.map((item) => ({
            problemId: item.problemId,
            score: item.score,
            order: item.order,
          })),
        },
        member.user.id,
        now,
      );

      const enrollment = enrollmentByUser.get(member.user.id);
      const status = enrollment?.status === 'SETTLED' ? 'SETTLED' : progress.status;

      const problemStatuses = assignment.problems.map((item) => {
        const problem = item.problem;
        const attempts = byStudentProblem.get(member.user.id + ':' + problem.id) || [];
        const progressItem = progress.problems.find((p) => p.problemId === problem.id);
        const accepted = attempts.find((submission) => submission.status === 'ACCEPTED');
        const best = accepted || attempts[0];
        let displayStatus = best ? best.status : 'NOT_SUBMITTED';
        if (progressItem?.solved) {
          displayStatus = progressItem.late ? 'LATE_ACCEPTED' : 'ACCEPTED';
        } else if (!best && now < assignment.startTime) {
          displayStatus = 'NOT_STARTED';
        } else if (!best && now > assignment.endTime && !assignment.allowLate) {
          displayStatus = 'EXPIRED';
        }
        return {
          problemId: problem.id,
          title: problem.title,
          status: displayStatus,
          attempts: attempts.length,
          bestSubmissionId: best?.id || null,
          score: progressItem?.earnedScore ?? best?.score ?? 0,
          timeUsed: best?.timeUsed ?? null,
          memoryUsed: best?.memoryUsed ?? null,
          submittedAt: progressItem?.acceptedAt ?? best?.createdAt ?? null,
          late: progressItem?.late ?? false,
          source: progressItem?.source ?? null,
        };
      });

      students.push({
        user: member.user,
        status,
        statusLabel: statusLabelZh(status),
        solvedCount: progress.solvedCount,
        totalProblems: progress.totalProblems,
        requiredCount: progress.requiredCount,
        score: enrollment?.status === 'SETTLED' ? enrollment.score : progress.score,
        maxScore: progress.maxScore,
        completed: progress.completed || status === 'SETTLED',
        late: progress.late,
        submittedAt: enrollment?.submittedAt ?? progress.submittedAt,
        completedAt: enrollment?.completedAt ?? progress.completedAt,
        problems: problemStatuses,
      });
    }

    const filtered = filterReportStudents(students, {
      status: filters.status,
      keyword: filters.keyword,
      completion: filters.completion,
    });

    return {
      assignment: {
        id: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        description: assignment.description,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        allowLate: assignment.allowLate,
        latePenalty: assignment.latePenalty,
        passCondition: assignment.passCondition,
        countExternalAc: assignment.countExternalAc,
        lifecycle: assignmentLifecycleLabel(
          assignment.startTime,
          assignment.endTime,
          now,
          assignment.allowLate,
        ),
      },
      class: { id: cls.id, name: cls.name },
      problems: assignment.problems.map((item) => item.problem),
      students: filtered,
      summary: {
        studentCount: students.length,
        filteredCount: filtered.length,
        problemCount: assignment.problems.length,
        completedStudents: students.filter((student) => student.completed).length,
        lateStudents: students.filter((student) => student.status === 'LATE').length,
        expiredStudents: students.filter((student) => student.status === 'EXPIRED').length,
        inProgressStudents: students.filter((student) => student.status === 'IN_PROGRESS').length,
        notStartedStudents: students.filter((student) => student.status === 'NOT_STARTED').length,
      },
      filters: {
        status: filters.status || '',
        keyword: filters.keyword || '',
        completion: filters.completion || 'all',
      },
    };
  }

  async exportAssignmentReportCsv(teacherId: string, assignmentId: string, filters: ReportFilters = {}) {
    const report = await this.getAssignmentReport(teacherId, assignmentId, filters);
    const csv = buildAssignmentReportCsv({
      assignmentTitle: report.assignment.title,
      problems: report.problems,
      students: report.students.map((student) => ({
        username: student.user.username,
        nickname: student.user.nickname,
        status: student.status,
        solvedCount: student.solvedCount,
        totalProblems: student.totalProblems,
        score: student.score,
        completedAt: student.completedAt,
        problems: student.problems.map((item) => ({
          problemId: item.problemId,
          title: item.title,
          status: item.status,
          attempts: item.attempts,
        })),
      })),
    });
    return {
      filename: `assignment-${report.assignment.id}-report.csv`,
      contentType: 'text/csv; charset=utf-8',
      csv,
    };
  }

  async settleAssignment(teacherId: string, assignmentId: string) {
    await this.requireOwnedAssignment(teacherId, assignmentId);
    return this.assignmentProgress.settleAssignment(assignmentId);
  }

  async refreshAssignmentProgress(teacherId: string, assignmentId: string) {
    await this.requireOwnedAssignment(teacherId, assignmentId);
    return this.assignmentProgress.recomputeAssignment(assignmentId);
  }

  async getNotificationOutboxStats(teacherId: string) {
    // Any teacher/admin can view aggregate delivery health for their ops panel.
    void teacherId;
    return this.notificationOutbox.getStats();
  }

  async retryNotificationOutbox(teacherId: string, limit = 50) {
    void teacherId;
    return this.notificationOutbox.retryPending(limit);
  }

  private async requireOwnedAssignment(teacherId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('作业不存在');
    const cls = await this.prisma.class.findUnique({ where: { id: assignment.classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作该作业');
    return assignment;
  }

  private async ensureApprovedMembersEnrolled(classId: string, assignmentId: string) {
    const members = await this.prisma.classMember.findMany({
      where: { classId, status: 'APPROVED' },
      select: { userId: true },
    });
    if (!members.length) return;
    await this.prisma.assignmentStudent.createMany({
      data: members.map((member) => ({
        assignmentId,
        userId: member.userId,
        status: 'NOT_STARTED',
        score: 0,
      })),
      skipDuplicates: true,
    });
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
