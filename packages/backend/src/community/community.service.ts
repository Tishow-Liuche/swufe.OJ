import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FileUploadService } from '../common/file-upload.service';
import { PrismaService } from '../prisma/prisma.service';

type Viewer = { id: string; role: string };

const POST_TYPES = new Set(['DISCUSSION', 'SOLUTION', 'FORUM']);
const SPOILER_LEVELS = new Set(['NONE', 'HINT', 'SOLUTION']);
const REPORT_TARGETS = new Set(['POST', 'REPLY']);
const REPORT_STATUSES = new Set(['OPEN', 'RESOLVED', 'DISMISSED']);
const FEEDBACK_TYPES = new Set(['STATEMENT', 'SAMPLE', 'TESTDATA', 'OTHER']);
const FEEDBACK_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']);

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
  ) {}

  async listAnnouncements() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        audience: 'ALL',
        publishAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true, title: true, content: true, audience: true, isPinned: true,
        publishAt: true, expiresAt: true,
        author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } },
      },
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
      take: 30,
    });
  }

  async listPosts(query: { type?: string; problemId?: string; category?: string; keyword?: string; sort?: string }) {
    const type = query.type?.toUpperCase();
    if (type && !POST_TYPES.has(type)) throw new BadRequestException('不支持的帖子类型');
    const sort = ['LATEST', 'HOT', 'UNANSWERED'].includes(String(query.sort || '').toUpperCase())
      ? String(query.sort).toUpperCase() : 'LATEST';
    const keyword = this.cleanText(query.keyword, 80, false);
    const where: any = {
      status: 'PUBLISHED',
      ...(type ? { type } : {}),
      ...(query.problemId ? { problemId: query.problemId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(keyword ? {
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { content: { contains: keyword, mode: 'insensitive' } },
        ],
      } : {}),
      ...(sort === 'UNANSWERED' ? { replies: { none: { status: 'PUBLISHED' } } } : {}),
    };

    const posts = await this.prisma.communityPost.findMany({
      where,
      include: {
        author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } },
        problem: { select: { id: true, title: true } },
        _count: { select: { replies: { where: { status: 'PUBLISHED' } }, reactions: true } },
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const sorted = [...posts].sort((left: any, right: any) => {
      if (left.isPinned !== right.isPinned) return Number(right.isPinned) - Number(left.isPinned);
      if (sort === 'HOT') {
        const leftScore = left._count.reactions * 4 + left._count.replies * 2 + Math.min(left.viewCount, 100) / 20;
        const rightScore = right._count.reactions * 4 + right._count.replies * 2 + Math.min(right.viewCount, 100) / 20;
        return rightScore - leftScore || Number(right.updatedAt) - Number(left.updatedAt);
      }
      return Number(right.updatedAt) - Number(left.updatedAt);
    });
    return Promise.all(sorted.map((post) => this.serializePostPreview(post)));
  }

  async getPost(postId: string, viewer: Viewer) {
    await this.prisma.communityPost.updateMany({
      where: { id: postId, status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, status: 'PUBLISHED' },
      include: {
        author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } },
        problem: { select: { id: true, title: true } },
        replies: {
          where: { status: 'PUBLISHED' },
          include: { author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } } },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { replies: { where: { status: 'PUBLISHED' } }, reactions: true } },
      },
    });
    if (!post) throw new NotFoundException('帖子不存在或已隐藏');

    const viewerReaction = await this.prisma.communityReaction.findUnique({
      where: { userId_postId_type: { userId: viewer.id, postId, type: 'UPVOTE' } },
      select: { id: true },
    });
    const replyReactionState = await this.getReplyReactionState(post.replies, viewer.id);

    if (!(await this.canReadSpoiler(post, viewer))) {
      return {
        ...(await this.serializePostPreview(post)),
        content: null,
        imageUrls: [],
        contentLocked: true,
        lockReason: '通过本题后即可查看完整题解，避免在练习前剧透。',
        replies: [],
        viewerReacted: Boolean(viewerReaction),
      };
    }

    return {
      ...(await this.serializePostDetail(post, replyReactionState)),
      contentLocked: false,
      viewerReacted: Boolean(viewerReaction),
    };
  }

  async createPost(viewer: Viewer, body: any) {
    const type = String(body.type || 'DISCUSSION').toUpperCase();
    const title = this.cleanText(body.title, 120, false);
    const content = this.cleanText(body.content, 12000, true);
    const problemId = body.problemId ? String(body.problemId) : undefined;
    const category = this.cleanText(body.category, 40, false);
    const requestedSpoiler = String(body.spoilerLevel || 'NONE').toUpperCase();
    const imagePaths = this.normalizeImagePaths(body.imagePaths);

    if (!POST_TYPES.has(type)) throw new BadRequestException('不支持的帖子类型');
    if (type === 'FORUM' && !title) throw new BadRequestException('论坛帖子需要标题');
    if (requestedSpoiler && !SPOILER_LEVELS.has(requestedSpoiler)) {
      throw new BadRequestException('不支持的防剧透级别');
    }
    if (problemId) {
      const problem = await this.prisma.problem.findUnique({ where: { id: problemId }, select: { id: true } });
      if (!problem) throw new NotFoundException('关联题目不存在');
    }
    if (type === 'SOLUTION') {
      if (!problemId) throw new BadRequestException('题解必须关联一道题目');
      if (!this.isModerator(viewer) && !(await this.hasSolved(viewer.id, problemId))) {
        throw new ForbiddenException('通过本题后才能发布题解');
      }
    }

    const spoilerLevel = type === 'SOLUTION' ? 'SOLUTION' : requestedSpoiler;
    const post = await this.prisma.communityPost.create({
      data: {
        type, title: title || null, content, category: category || null,
        spoilerLevel, problemId: problemId || null, authorId: viewer.id, imagePaths,
      },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } } },
    });
    await this.audit(viewer.id, 'COMMUNITY_POST_CREATE', 'CommunityPost', post.id, { type, problemId, imageCount: imagePaths.length });
    await this.notifyMentions(content, viewer, `/community?post=${post.id}`);
    return {
      ...post,
      imagePaths: undefined,
      imageUrls: await this.getDisplayImageUrls(imagePaths),
      author: await this.withDisplayAvatar(post.author),
    };
  }

  async createReply(postId: string, viewer: Viewer, rawContent: string, rawParentReplyId?: string) {
    const content = this.cleanText(rawContent, 4000, true);
    const post = await this.prisma.communityPost.findFirst({ where: { id: postId, status: 'PUBLISHED' } });
    if (!post) throw new NotFoundException('帖子不存在或已隐藏');
    if (!(await this.canReadSpoiler(post, viewer))) {
      throw new ForbiddenException('通过本题后才能参与该题解讨论');
    }

    const parentReplyId = this.cleanText(rawParentReplyId, 64, false) || undefined;
    if (parentReplyId) {
      const parentReply = await this.prisma.communityReply.findFirst({
        where: { id: parentReplyId, postId, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (!parentReply) throw new NotFoundException('要回复的内容不存在或已隐藏');
    }

    const reply = await this.prisma.communityReply.create({
      data: { postId, authorId: viewer.id, content, parentReplyId: parentReplyId || null },
      include: { author: { select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true } } },
    });
    if (post.authorId !== viewer.id) {
      await this.notify(post.authorId, 'POST_REPLY', '你的帖子收到了新回复', content.slice(0, 120), `/community?post=${postId}`);
    }
    await this.notifyMentions(content, viewer, `/community?post=${postId}`, [post.authorId]);
    return { ...reply, author: await this.withDisplayAvatar(reply.author) };
  }

  async uploadCommunityImage(viewer: Viewer, file: Express.Multer.File) {
    const path = await this.fileUpload.uploadCommunityImage(file);
    await this.audit(viewer.id, 'COMMUNITY_IMAGE_UPLOAD', 'CommunityImage', path, { size: file.size, mimetype: file.mimetype });
    return { path, url: await this.fileUpload.getPresignedUrl(path) };
  }

  async toggleReaction(postId: string, viewer: Viewer) {
    const post = await this.prisma.communityPost.findFirst({ where: { id: postId, status: 'PUBLISHED' } });
    if (!post) throw new NotFoundException('帖子不存在或已隐藏');
    if (!(await this.canReadSpoiler(post, viewer))) {
      throw new ForbiddenException('通过本题后才能为该题解点赞');
    }

    const existing = await this.prisma.communityReaction.findUnique({
      where: { userId_postId_type: { userId: viewer.id, postId, type: 'UPVOTE' } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.communityReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.communityReaction.create({ data: { userId: viewer.id, postId, type: 'UPVOTE' } });
    }
    const reactionCount = await this.prisma.communityReaction.count({ where: { postId, type: 'UPVOTE' } });
    return { reacted: !existing, reactionCount };
  }

  async toggleReplyReaction(replyId: string, viewer: Viewer) {
    const reply = await this.prisma.communityReply.findFirst({
      where: { id: replyId, status: 'PUBLISHED', post: { status: 'PUBLISHED' } },
      include: { post: { select: { spoilerLevel: true, problemId: true, authorId: true } } },
    });
    if (!reply) throw new NotFoundException('回复不存在或已隐藏');
    if (!(await this.canReadSpoiler(reply.post, viewer))) {
      throw new ForbiddenException('通过本题后才能为该题解回复点赞');
    }

    const existing = await this.prisma.communityReplyReaction.findUnique({
      where: { userId_replyId_type: { userId: viewer.id, replyId, type: 'UPVOTE' } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.communityReplyReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.communityReplyReaction.create({ data: { userId: viewer.id, replyId, type: 'UPVOTE' } });
    }
    const reactionCount = await this.prisma.communityReplyReaction.count({ where: { replyId, type: 'UPVOTE' } });
    return { reacted: !existing, reactionCount };
  }

  async markPostResolved(postId: string, viewer: Viewer, resolved: boolean) {
    const post = await this.prisma.communityPost.findFirst({ where: { id: postId, status: 'PUBLISHED' } });
    if (!post) throw new NotFoundException('帖子不存在或已隐藏');
    if (post.authorId !== viewer.id && !this.isModerator(viewer)) {
      throw new ForbiddenException('仅帖子作者或教师可更新状态');
    }
    if (post.type === 'SOLUTION') throw new BadRequestException('题解不需要标记为已解决');
    const updated = await this.prisma.communityPost.update({ where: { id: postId }, data: { isResolved: Boolean(resolved) } });
    await this.audit(viewer.id, 'COMMUNITY_POST_RESOLVE', 'CommunityPost', postId, { resolved: Boolean(resolved) });
    return updated;
  }

  async createReport(viewer: Viewer, body: any) {
    const targetType = String(body.targetType || '').toUpperCase();
    const targetId = String(body.targetId || '');
    const reason = this.cleanText(body.reason, 80, true);
    const detail = this.cleanText(body.detail, 1000, false);
    if (!REPORT_TARGETS.has(targetType) || !targetId) throw new BadRequestException('举报对象不正确');
    await this.ensureReportTarget(targetType, targetId);

    const existing = await this.prisma.contentReport.findFirst({
      where: { reporterId: viewer.id, targetType, targetId, status: 'OPEN' },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('该内容已在审核中');

    const report = await this.prisma.contentReport.create({
      data: { reporterId: viewer.id, targetType, targetId, reason, detail: detail || null },
    });
    await this.audit(viewer.id, 'CONTENT_REPORT_CREATE', targetType, targetId, { reason });
    return report;
  }

  async createProblemFeedback(viewer: Viewer, body: any) {
    const problemId = String(body.problemId || '');
    const type = String(body.type || 'STATEMENT').toUpperCase();
    const content = this.cleanText(body.content, 3000, true);
    if (!FEEDBACK_TYPES.has(type)) throw new BadRequestException('不支持的反馈类型');
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId }, select: { id: true } });
    if (!problem) throw new NotFoundException('题目不存在');
    const feedback = await this.prisma.problemFeedback.create({
      data: { problemId, reporterId: viewer.id, type, content },
    });
    await this.audit(viewer.id, 'PROBLEM_FEEDBACK_CREATE', 'Problem', problemId, { type });
    return feedback;
  }

  async getNotifications(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markNotificationRead(notificationId: string, userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId }, data: { readAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('通知不存在');
    return { ok: true };
  }

  async markAllNotificationsRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, count: updated.count };
  }

  async createAnnouncement(viewer: Viewer, body: any) {
    this.ensureModerator(viewer);
    const title = this.cleanText(body.title, 120, true);
    const content = this.cleanText(body.content, 6000, true);
    const requestedAudience = String(body.audience || 'ALL').toUpperCase();
    if (requestedAudience !== 'ALL') {
      throw new BadRequestException('当前仅支持面向全体用户发布公告');
    }
    const audience = 'ALL';
    const announcement = await this.prisma.announcement.create({
      data: {
        title, content, audience, authorId: viewer.id,
        isPinned: Boolean(body.isPinned),
        publishAt: body.publishAt ? new Date(body.publishAt) : new Date(),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    await this.audit(viewer.id, 'ANNOUNCEMENT_CREATE', 'Announcement', announcement.id, { audience });
    return announcement;
  }

  async getModerationOverview(viewer: Viewer) {
    this.ensureModerator(viewer);
    const [openReports, openFeedback] = await Promise.all([
      this.prisma.contentReport.count({ where: { status: 'OPEN' } }),
      this.prisma.problemFeedback.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return { openReports, openFeedback };
  }

  async listReports(viewer: Viewer, status?: string) {
    this.ensureModerator(viewer);
    return this.prisma.contentReport.findMany({
      where: status ? { status: status.toUpperCase() } : {},
      include: {
        reporter: { select: { id: true, username: true, nickname: true } },
        reviewer: { select: { id: true, username: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }).then(async (reports) => Promise.all(reports.map(async (report) => ({
      ...report,
      target: await this.getReportTargetPreview(report.targetType, report.targetId),
    }))));
  }

  async reviewReport(reportId: string, viewer: Viewer, body: any) {
    this.ensureModerator(viewer);
    const status = String(body.status || '').toUpperCase();
    const reviewerNote = this.cleanText(body.reviewerNote, 1000, false);
    if (!REPORT_STATUSES.has(status) || status === 'OPEN') throw new BadRequestException('请选择审核结论');
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('举报不存在');

    if (Boolean(body.hideTarget) && status === 'RESOLVED') {
      if (report.targetType === 'POST') {
        await this.prisma.communityPost.updateMany({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
      } else if (report.targetType === 'REPLY') {
        await this.prisma.communityReply.updateMany({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
      }
    }
    const updated = await this.prisma.contentReport.update({
      where: { id: reportId },
      data: { status, reviewerId: viewer.id, reviewerNote: reviewerNote || null },
    });
    await this.notify(report.reporterId, 'REPORT_REVIEWED', '你的举报已处理', reviewerNote || `处理结论：${status}`, '/community');
    await this.audit(viewer.id, 'CONTENT_REPORT_REVIEW', report.targetType, report.targetId, { status, hideTarget: Boolean(body.hideTarget) });
    return updated;
  }

  async listProblemFeedback(viewer: Viewer, status?: string) {
    this.ensureModerator(viewer);
    return this.prisma.problemFeedback.findMany({
      where: status ? { status: status.toUpperCase() } : {},
      include: {
        problem: { select: { id: true, title: true } },
        reporter: { select: { id: true, username: true, nickname: true } },
        reviewer: { select: { id: true, username: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async reviewProblemFeedback(feedbackId: string, viewer: Viewer, body: any) {
    this.ensureModerator(viewer);
    const status = String(body.status || '').toUpperCase();
    const reviewerNote = this.cleanText(body.reviewerNote, 1000, false);
    if (!FEEDBACK_STATUSES.has(status) || status === 'OPEN') throw new BadRequestException('请选择反馈处理状态');
    const feedback = await this.prisma.problemFeedback.findUnique({ where: { id: feedbackId } });
    if (!feedback) throw new NotFoundException('反馈不存在');
    const updated = await this.prisma.problemFeedback.update({
      where: { id: feedbackId },
      data: { status, reviewerId: viewer.id, reviewerNote: reviewerNote || null },
    });
    await this.notify(feedback.reporterId, 'PROBLEM_FEEDBACK_REVIEWED', '你的题目反馈已处理', reviewerNote || `处理状态：${status}`, `/problems/${feedback.problemId}`);
    await this.audit(viewer.id, 'PROBLEM_FEEDBACK_REVIEW', 'ProblemFeedback', feedbackId, { status });
    return updated;
  }

  private async serializePostPreview(post: any) {
    const locked = post.spoilerLevel === 'SOLUTION';
    const { imagePaths = [], _count, author, ...postValue } = post;
    return {
      ...postValue,
      author: await this.withDisplayAvatar(author),
      content: locked ? null : post.content,
      contentPreview: locked ? '这是一篇题解，完成题目后可查看全文。' : post.content.slice(0, 220),
      contentLocked: locked,
      imageUrls: locked ? [] : await this.getDisplayImageUrls(imagePaths),
      reactionCount: _count?.reactions || 0,
      replyCount: _count?.replies || 0,
    };
  }

  private async serializePostDetail(post: any, replyReactionState = new Map<string, { reactionCount: number; viewerReacted: boolean }>()) {
    const { imagePaths = [], _count, author, replies = [], ...postValue } = post;
    return {
      ...postValue,
      author: await this.withDisplayAvatar(author),
      imageUrls: await this.getDisplayImageUrls(imagePaths),
      reactionCount: _count?.reactions || 0,
      replyCount: _count?.replies || 0,
      replies: await Promise.all(replies.map((reply: any) => this.serializeReply(reply, replyReactionState.get(reply.id)))),
    };
  }

  private async serializeReply(reply: any, reactionState?: { reactionCount: number; viewerReacted: boolean }) {
    return {
      ...reply,
      author: await this.withDisplayAvatar(reply.author),
      reactionCount: reactionState?.reactionCount || 0,
      viewerReacted: reactionState?.viewerReacted || false,
    };
  }

  private async getReplyReactionState(replies: Array<{ id: string }>, viewerId: string) {
    const replyIds = replies.map((reply) => reply.id);
    if (!replyIds.length) return new Map<string, { reactionCount: number; viewerReacted: boolean }>();
    const [counts, viewerReactions] = await Promise.all([
      this.prisma.communityReplyReaction.groupBy({
        by: ['replyId'],
        where: { replyId: { in: replyIds }, type: 'UPVOTE' },
        _count: { _all: true },
      }),
      this.prisma.communityReplyReaction.findMany({
        where: { replyId: { in: replyIds }, userId: viewerId, type: 'UPVOTE' },
        select: { replyId: true },
      }),
    ]);
    const countByReply = new Map(counts.map((item) => [item.replyId, item._count._all]));
    const reactedReplyIds = new Set(viewerReactions.map((item) => item.replyId));
    return new Map(replyIds.map((replyId) => [replyId, {
      reactionCount: countByReply.get(replyId) || 0,
      viewerReacted: reactedReplyIds.has(replyId),
    }]));
  }

  private async getReportTargetPreview(targetType: string, targetId: string) {
    if (targetType === 'POST') {
      return this.prisma.communityPost.findUnique({
        where: { id: targetId },
        select: { id: true, title: true, content: true, status: true, author: { select: { username: true, nickname: true } } },
      });
    }
    return this.prisma.communityReply.findUnique({
      where: { id: targetId },
      select: { id: true, content: true, status: true, author: { select: { username: true, nickname: true } } },
    });
  }

  private normalizeImagePaths(value: unknown) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new BadRequestException('讨论图片格式不正确');
    if (value.length > 6) throw new BadRequestException('每条讨论最多上传 6 张图片');
    const paths = [...new Set(value.map((item) => typeof item === 'string' ? item : ''))];
    if (paths.some((path) => !this.fileUpload.isStoredPathInPrefix(path, 'community-images'))) {
      throw new BadRequestException('讨论图片来源不正确');
    }
    return paths;
  }

  private async getDisplayImageUrls(paths: string[]) {
    const urls = await Promise.all(paths.map(async (path) => {
      try {
        return await this.fileUpload.getPresignedUrl(path);
      } catch {
        return null;
      }
    }));
    return urls.filter((url): url is string => Boolean(url));
  }

  private async withDisplayAvatar<T extends { avatar?: string | null }>(author: T | null | undefined) {
    if (!author || !author.avatar || !author.avatar.startsWith('s3://')) return author;
    try {
      return { ...author, avatar: await this.fileUpload.getPresignedUrl(author.avatar) };
    } catch {
      return { ...author, avatar: null };
    }
  }

  private async canReadSpoiler(post: { spoilerLevel: string; problemId?: string | null; authorId: string }, viewer: Viewer) {
    if (post.spoilerLevel !== 'SOLUTION' || !post.problemId) return true;
    if (post.authorId === viewer.id || this.isModerator(viewer)) return true;
    return this.hasSolved(viewer.id, post.problemId);
  }

  private async hasSolved(userId: string, problemId: string) {
    const accepted = await this.prisma.submission.findFirst({
      where: { userId, problemId, status: 'ACCEPTED' }, select: { id: true },
    });
    return Boolean(accepted);
  }

  private async ensureReportTarget(targetType: string, targetId: string) {
    const target = targetType === 'POST'
      ? await this.prisma.communityPost.findUnique({ where: { id: targetId }, select: { id: true } })
      : await this.prisma.communityReply.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('举报内容不存在');
  }

  private ensureModerator(viewer: Viewer) {
    if (!this.isModerator(viewer)) throw new ForbiddenException('需要教师或管理员权限');
  }

  private isModerator(viewer: Viewer) {
    return viewer.role === 'TEACHER' || viewer.role === 'ADMIN';
  }

  private cleanText(value: unknown, maxLength: number, required: boolean) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw new BadRequestException('内容不能为空');
    if (text.length > maxLength) throw new BadRequestException(`内容不能超过 ${maxLength} 个字符`);
    return text;
  }

  private async notify(userId: string, type: string, title: string, content?: string, link?: string) {
    await this.prisma.notification.create({ data: { userId, type, title, content, link } });
  }

  private async notifyMentions(content: string, viewer: Viewer, link: string, excludedUserIds: string[] = []) {
    const usernames = [...new Set(
      [...content.matchAll(/@([a-zA-Z0-9_-]{2,32})/g)].map((match) => match[1]),
    )];
    if (!usernames.length) return;
    const [actor, users] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: viewer.id },
        select: { username: true, nickname: true },
      }),
      this.prisma.user.findMany({
        where: { username: { in: usernames }, id: { notIn: [viewer.id, ...excludedUserIds] } },
        select: { id: true, username: true, nickname: true },
      }),
    ]);
    const actorName = actor?.nickname || actor?.username || '有人';
    await Promise.all(users.map((user) => this.notify(
      user.id,
      'MENTION',
      `${actorName} 在社区中 @ 了你`,
      content.slice(0, 160),
      link,
    )));
  }

  private async audit(userId: string, action: string, resource: string, resourceId: string, detail: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { userId, action, resource, resourceId, detail: JSON.stringify(detail) },
    });
  }
}
