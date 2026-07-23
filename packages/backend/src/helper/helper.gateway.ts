import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket, MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { HelperService } from './helper.service';

@WebSocketGateway({ namespace: 'helper', cors: { origin: '*' } })
export class HelperGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(HelperGateway.name);
  private socketMap = new Map<string, string>(); // userId → socketId

  constructor(private helper: HelperService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      try {
        await this.helper.assertActiveUser(userId);
        this.socketMap.set(userId, client.id);
        this.logger.log(`Helper connected: user=${userId}`);
      } catch {
        client.disconnect(true);
      }
    }
  }

  handleDisconnect(client: Socket) {
    for (const [uid, sid] of this.socketMap) {
      if (sid === client.id) { this.socketMap.delete(uid); break; }
    }
  }

  /** Helper 认证并注册 */
  @SubscribeMessage('helper.register')
  async handleRegister(@ConnectedSocket() client: Socket, @MessageBody() data: {
    userId: string; deviceId: string; token: string;
  }) {
    await this.helper.assertActiveUser(data.userId);
    const socketId = this.socketMap.get(data.userId);
    if (!socketId) {
      this.socketMap.set(data.userId, client.id);
    }
    this.logger.log(`Helper registered: user=${data.userId} device=${data.deviceId}`);
    return { status: 'ok' };
  }

  /** Helper 请求下一个待提交任务 */
  @SubscribeMessage('helper.nextTask')
  async handleNextTask(@ConnectedSocket() client: Socket, @MessageBody() data: {
    userId: string; deviceId: string;
  }) {
    const task = await this.helper.getNextTask(data.userId, data.deviceId);
    return task || { taskId: null };
  }

  /** Helper 报告提交成功 */
  @SubscribeMessage('helper.receipt')
  async handleReceipt(@ConnectedSocket() client: Socket, @MessageBody() data: {
    taskId: string; userId: string; remoteSubmissionId: string;
    remoteUsername: string; submittedAt: string;
  }) {
    const result = await this.helper.submitReceipt(data.taskId, data.userId, {
      remoteSubmissionId: data.remoteSubmissionId,
      remoteUsername: data.remoteUsername,
      submittedAt: data.submittedAt,
    });
    return result;
  }

  /** Helper 报告提交失败 */
  @SubscribeMessage('helper.failure')
  async handleFailure(@ConnectedSocket() client: Socket, @MessageBody() data: {
    taskId: string; userId: string; failureCode: string; failureMessage?: string;
  }) {
    const result = await this.helper.submitFailure(data.taskId, data.userId, {
      failureCode: data.failureCode,
      failureMessage: data.failureMessage,
    });
    return result;
  }

  /** Helper 心跳 */
  @SubscribeMessage('helper.heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket, @MessageBody() data: {
    userId: string; deviceId: string;
  }) {
    await this.helper.heartbeat(data.deviceId, data.userId);
    return { status: 'ok' };
  }

  /** 后端推送任务给在线 Helper */
  pushTask(userId: string, task: any) {
    const socketId = this.socketMap.get(userId);
    if (socketId) {
      this.server.to(socketId).emit('helper.task.created', task);
      this.logger.log(`Task pushed to user=${userId}`);
      return true;
    }
    return false;
  }
}
