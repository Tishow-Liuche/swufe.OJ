import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FileUploadService } from '../common/file-upload.service';
import { PrismaService } from '../prisma/prisma.service';

type DirectUser = {
  id: string;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
};

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileUpload: FileUploadService,
  ) {}

  async searchContacts(userId: string, rawKeyword?: string) {
    const keyword = String(rawKeyword || '').trim();
    if (!keyword) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { username: { contains: keyword, mode: 'insensitive' } },
          { nickname: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, nickname: true, avatar: true },
      orderBy: { username: 'asc' },
      take: 20,
    });
    return Promise.all(users.map((user) => this.serializeUser(user)));
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.directConversation.findMany({
      where: { OR: [{ participantOneId: userId }, { participantTwoId: userId }] },
      include: {
        participantOne: { select: { id: true, username: true, nickname: true, avatar: true } },
        participantTwo: { select: { id: true, username: true, nickname: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, username: true, nickname: true, avatar: true } } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 60,
    });

    return Promise.all(conversations.map(async (conversation) => {
      const [serialized, unreadCount] = await Promise.all([
        this.serializeConversation(conversation, userId),
        this.prisma.directMessage.count({
          where: { conversationId: conversation.id, senderId: { not: userId }, readAt: null },
        }),
      ]);
      return { ...serialized, unreadCount };
    }));
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.directConversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ participantOneId: userId }, { participantTwoId: userId }],
      },
      include: {
        participantOne: { select: { id: true, username: true, nickname: true, avatar: true } },
        participantTwo: { select: { id: true, username: true, nickname: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 150,
          include: { sender: { select: { id: true, username: true, nickname: true, avatar: true } } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('私信会话不存在');

    await this.prisma.directMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    const [serializedConversation, messages] = await Promise.all([
      this.serializeConversation(conversation, userId),
      Promise.all(conversation.messages.map((message) => this.serializeMessage(message))),
    ]);
    return { conversation: serializedConversation, messages };
  }

  async sendMessage(senderId: string, body: { recipientId?: string; content?: string }) {
    const recipientId = String(body.recipientId || '').trim();
    const content = String(body.content || '').trim();
    if (!recipientId) throw new BadRequestException('请选择私信联系人');
    if (recipientId === senderId) throw new BadRequestException('不能给自己发送私信');
    if (!content) throw new BadRequestException('私信内容不能为空');
    if (content.length > 2000) throw new BadRequestException('私信内容不能超过 2000 个字符');

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('联系人不存在');

    const [participantOneId, participantTwoId] = [senderId, recipientId].sort();
    const conversation = await this.prisma.directConversation.upsert({
      where: {
        participantOneId_participantTwoId: { participantOneId, participantTwoId },
      },
      create: { participantOneId, participantTwoId },
      update: { lastMessageAt: new Date() },
    });
    const message = await this.prisma.directMessage.create({
      data: { conversationId: conversation.id, senderId, content },
      include: {
        sender: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });
    const senderName = message.sender.nickname || message.sender.username;
    await this.prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'DIRECT_MESSAGE',
        title: `${senderName} 给你发来一条私信`,
        content: content.slice(0, 180),
        link: `/messages?conversation=${conversation.id}`,
      },
    });

    return this.serializeMessage(message);
  }

  private async serializeConversation(conversation: any, viewerId: string) {
    const counterpart = conversation.participantOneId === viewerId
      ? conversation.participantTwo
      : conversation.participantOne;
    const latest = conversation.messages?.[0] || null;
    return {
      id: conversation.id,
      lastMessageAt: conversation.lastMessageAt,
      counterpart: await this.serializeUser(counterpart),
      lastMessage: latest ? await this.serializeMessage(latest) : null,
    };
  }

  private async serializeMessage(message: any) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      readAt: message.readAt || null,
      createdAt: message.createdAt,
      sender: await this.serializeUser(message.sender),
    };
  }

  private async serializeUser(user: DirectUser) {
    if (!user) return null;
    return {
      ...user,
      avatar: await this.avatarUrl(user.avatar),
    };
  }

  private async avatarUrl(avatar?: string | null) {
    if (!avatar || !avatar.startsWith('s3://')) return avatar || null;
    try {
      return await this.fileUpload.getPresignedUrl(avatar);
    } catch {
      return null;
    }
  }
}
