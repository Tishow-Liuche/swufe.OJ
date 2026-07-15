import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

type StudentImportRow = {
  studentId: string;
  name: string;
  college: string;
  phone: string;
  email: string;
};

const SWUFE_COLLEGES = new Set([
  '金融学院、中国金融研究院', '经济学院', '会计学院', '统计与数据科学学院', '工商管理学院', '财政税务学院', '国际商学院', '经济与管理研究院',
  '中国西部经济研究院', '管理科学与工程学院', '计算机与人工智能学院', '法学院', '外国语学院', '公共管理学院', '马克思主义学院', '数学学院',
  '人文与艺术学院', '体育学院', '社会发展研究院', '特拉华数据科学学院', '继续教育学院（西南财经大学培训中心）', '国际教育学院', '北京研究院', '深圳高等研究院', '西部商学院', '出国留学预备学院',
]);

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
    const name = data.name?.trim();
    if (!name || name.length > 80) throw new BadRequestException('请填写 1 至 80 字的班级名称');
    return this.prisma.class.create({
      data: { name, teacherId, status: 'PENDING' },
    });
  }

  async importStudents(classId: string, teacherId: string, students: StudentImportRow[]) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');
    if (cls.status !== 'APPROVED') throw new ForbiddenException('班级尚未通过管理员审核，暂不能导入学生');
    if (!Array.isArray(students) || !students.length) throw new BadRequestException('请导入至少一名学生');
    if (students.length > 500) throw new BadRequestException('单次最多导入 500 名学生');

    let added = 0, updated = 0, skipped = 0;
    const errors: Array<{ row: number; studentId: string; reason: string }> = [];
    const seen = new Set<string>();
    for (const [index, raw] of students.entries()) {
      const row = index + 2;
      const studentId = String(raw.studentId || '').trim();
      const name = String(raw.name || '').trim();
      const college = String(raw.college || '').trim();
      const phone = String(raw.phone || '').trim();
      const email = String(raw.email || '').trim().toLowerCase();
      if (!/^\d{8}$/.test(studentId)) { errors.push({ row, studentId, reason: '学号必须为 8 位数字' }); skipped++; continue; }
      if (!name || name.length > 40) { errors.push({ row, studentId, reason: '姓名不能为空且不超过 40 字' }); skipped++; continue; }
      if (!college || college.length > 80) { errors.push({ row, studentId, reason: '学院不能为空' }); skipped++; continue; }
      if (!/^1\d{10}$/.test(phone)) { errors.push({ row, studentId, reason: '手机号须为 11 位中国大陆号码' }); skipped++; continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ row, studentId, reason: '邮箱格式不正确' }); skipped++; continue; }
      if (seen.has(studentId)) { errors.push({ row, studentId, reason: '文件内学号重复' }); skipped++; continue; }
      seen.add(studentId);

      const emailOwner = await this.prisma.user.findUnique({ where: { email } });
      const existingUser = await this.prisma.user.findUnique({ where: { username: studentId } });
      if (emailOwner && emailOwner.id !== existingUser?.id) {
        errors.push({ row, studentId, reason: '该邮箱已被其他账号使用' }); skipped++; continue;
      }
      if (existingUser && existingUser.role !== 'STUDENT') {
        errors.push({ row, studentId, reason: '该学号已被非学生账号占用' }); skipped++; continue;
      }

      const accountData = { email, nickname: name, studentId, college, phone, school: SWUFE_COLLEGES.has(college) ? '西南财经大学' : '其他学校' };
      const user = existingUser
        ? await this.prisma.user.update({
            where: { id: existingUser.id },
            // 已有账号只更新教务资料，绝不在批量导入时重置密码或改写登录状态。
            data: accountData,
          })
        : await this.prisma.user.create({
            data: { username: studentId, password: await bcrypt.hash(studentId, 10), role: 'STUDENT', requestedRole: 'STUDENT', mustChangePassword: true, ...accountData },
          });

      const member = await this.prisma.classMember.findUnique({ where: { classId_userId: { classId, userId: user.id } } });
      if (!member) { await this.prisma.classMember.create({ data: { classId, userId: user.id } }); added++; }
      else updated++;
    }
    return { added, updated, skipped, errors };
  }

  async getClassMembers(classId: string, teacherId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (cls.teacherId !== teacherId) throw new ForbiddenException('无权操作此班级');
    return this.prisma.classMember.findMany({
      where: { classId },
      include: { user: { select: { id: true, username: true, nickname: true, studentId: true, college: true, phone: true, email: true, mustChangePassword: true } } },
    });
  }

  // ========== 作业管理 ==========

  async getAssignments(teacherId: string) {
    // 先获取教师的所有班级 ID
    const classIds = (await this.prisma.class.findMany({
      where: { teacherId, status: 'APPROVED' },
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
    if (!cls || cls.teacherId !== teacherId || cls.status !== 'APPROVED') throw new ForbiddenException('班级未通过审核或无权操作');

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
    penaltyTime?: number; password?: string; teamMode?: boolean; isRated?: boolean;
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
        teamMode: data.teamMode ?? false,
        isRated: data.isRated ?? false,
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
