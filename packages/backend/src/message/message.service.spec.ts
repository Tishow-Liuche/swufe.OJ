import { BadRequestException } from '@nestjs/common';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let service: MessageService;
  let prisma: any;
  let fileUpload: any;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      directConversation: { upsert: jest.fn() },
      directMessage: { create: jest.fn() },
      notification: { create: jest.fn() },
    };
    fileUpload = { getPresignedUrl: jest.fn() };
    service = new MessageService(prisma, fileUpload);
  });

  it('creates a canonical one-to-one conversation, persists the message, and notifies its recipient', async () => {
    const createdAt = new Date('2026-07-17T08:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      id: 'alice', username: 'alice', nickname: 'Alice', avatar: null,
    });
    prisma.directConversation.upsert.mockResolvedValue({
      id: 'conversation-1', participantOneId: 'alice', participantTwoId: 'zeta',
    });
    prisma.directMessage.create.mockResolvedValue({
      id: 'message-1', conversationId: 'conversation-1', senderId: 'zeta',
      content: '你好，想一起讨论这道题吗？', createdAt,
      sender: { id: 'zeta', username: 'zeta', nickname: '泽塔', avatar: null },
    });

    const result = await service.sendMessage('zeta', {
      recipientId: 'alice',
      content: '  你好，想一起讨论这道题吗？  ',
    });

    expect(prisma.directConversation.upsert).toHaveBeenCalledWith({
      where: {
        participantOneId_participantTwoId: {
          participantOneId: 'alice', participantTwoId: 'zeta',
        },
      },
      create: { participantOneId: 'alice', participantTwoId: 'zeta' },
      update: { lastMessageAt: expect.any(Date) },
    });
    expect(prisma.directMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-1',
        senderId: 'zeta',
        content: '你好，想一起讨论这道题吗？',
      },
      include: {
        sender: { select: { id: true, username: true, nickname: true, avatar: true } },
      },
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'alice',
        type: 'DIRECT_MESSAGE',
        title: '泽塔 给你发来一条私信',
        content: '你好，想一起讨论这道题吗？',
        link: '/messages?conversation=conversation-1',
      },
    });
    expect(result).toEqual(expect.objectContaining({
      id: 'message-1', content: '你好，想一起讨论这道题吗？',
    }));
  });

  it('rejects sending a private message to the current account', async () => {
    await expect(service.sendMessage('alice', {
      recipientId: 'alice', content: '你好',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
