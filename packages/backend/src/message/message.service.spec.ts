import { BadRequestException } from '@nestjs/common';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let service: MessageService;
  let prisma: any;
  let fileUpload: any;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      directConversation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      directMessage: { create: jest.fn() },
      notification: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    fileUpload = { getPresignedUrl: jest.fn() };
    service = new MessageService(prisma, fileUpload);
  });

  it('creates a canonical one-to-one conversation, persists the message, and notifies its recipient', async () => {
    const createdAt = new Date('2026-07-17T08:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      id: 'alice', username: 'alice', nickname: 'Alice', avatar: null,
    });
    prisma.directConversation.findUnique.mockResolvedValue(null);
    prisma.directConversation.create.mockResolvedValue({
      id: 'conversation-1',
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

    expect(prisma.directConversation.create).toHaveBeenCalledWith({
      data: {
        participantOneId: 'alice', participantTwoId: 'zeta',
        lastMessageAt: expect.any(Date), initiatorId: 'zeta',
      },
      select: { id: true },
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

  it('allows only one outgoing message until the recipient replies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'alice' });
    prisma.directConversation.findUnique.mockResolvedValue({
      id: 'conversation-1', initiatorId: 'zeta', messagingUnlocked: false,
    });

    await expect(service.sendMessage('zeta', {
      recipientId: 'alice', content: '再补充一句',
    })).rejects.toMatchObject({ message: '对方回复前只能发送一条私信' });
    expect(prisma.directMessage.create).not.toHaveBeenCalled();
  });

  it('unlocks a conversation permanently after the recipient replies', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'alice' });
    prisma.directConversation.findUnique.mockResolvedValue({
      id: 'conversation-1', initiatorId: 'zeta', messagingUnlocked: false,
    });
    prisma.directConversation.update.mockResolvedValue({ id: 'conversation-1' });
    prisma.directMessage.create.mockResolvedValue({
      id: 'message-2', conversationId: 'conversation-1', senderId: 'alice', content: '收到',
      createdAt: new Date(), sender: { id: 'alice', username: 'alice', avatar: null },
    });

    await service.sendMessage('alice', { recipientId: 'zeta', content: '收到' });
    expect(prisma.directConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ messagingUnlocked: true }),
    }));
  });
});
