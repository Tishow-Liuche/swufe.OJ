import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProblemAccessService, type ProblemActor } from '../common/problem-access.service';
import { AtCoderReadonlyAdapter } from './atcoder-readonly.adapter';
import {
  ATCODER_ADAPTER_VERSION,
  ATCODER_PLATFORM,
  AtCoderAdapterError,
  AtCoderProblemMetadata,
} from './atcoder.types';

@Injectable()
export class AtCoderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: AtCoderReadonlyAdapter,
    private readonly config: ConfigService,
    private readonly problemAccess: ProblemAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePlatform();
  }

  async getPlatformStatus() {
    const platform = await this.ensurePlatform();
    const environmentEnabled = this.isEnvironmentEnabled();
    return {
      code: platform.code,
      name: platform.name,
      enabled: platform.enabled && environmentEnabled,
      readOnly: platform.readOnly,
      allowAutoSubmit: platform.allowAutoSubmit,
      supportsMetadata: platform.supportsMetadata,
      adapterVersion: platform.adapterVersion,
      killSwitchReason: environmentEnabled
        ? platform.killSwitchReason
        : 'VJUDGE_ATCODER_ENABLED 已关闭 AtCoder 元数据同步',
    };
  }

  async updatePlatform(enabled: boolean, reason?: string) {
    await this.ensurePlatform();
    return this.prisma.externalPlatform.update({
      where: { code: ATCODER_PLATFORM },
      data: {
        enabled,
        readOnly: true,
        allowAutoSubmit: false,
        killSwitchReason:
          enabled === false
            ? reason || '管理员已暂停 AtCoder 元数据同步'
            : null,
      },
    });
  }

  async importProblem(url: string, actor: ProblemActor) {
    const platform = await this.ensurePlatform();
    if (!platform.enabled || !this.isEnvironmentEnabled()) {
      throw new ServiceUnavailableException(
        platform.killSwitchReason || 'AtCoder 元数据同步已暂停',
      );
    }

    let metadata: AtCoderProblemMetadata;
    try {
      metadata = await this.adapter.fetchProblem(url);
    } catch (error) {
      this.rethrowAdapterError(error);
    }

    const capabilityJson = {
      statementMirrored: false,
      originalSiteOnly: true,
      autoSubmit: false,
      resultSync: false,
      reason:
        'AtCoder 未提供经本项目核验可用的第三方提交 API，当前仅保存最小元数据',
    };
    const metadataHash = createHash('sha256')
      .update(JSON.stringify({ ...metadata!, capabilityJson }))
      .digest('hex');
    const description = [
      '## AtCoder 原题',
      '',
      '本平台当前仅保存标题、时间/内存限制和来源标识，不复制完整题面。',
      '',
      `[前往 AtCoder 查看原题](${metadata!.remoteUrl})`,
    ].join('\n');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.problemSource.findUnique({
        where: {
          platform_remoteProblemId: {
            platform: ATCODER_PLATFORM,
            remoteProblemId: metadata!.remoteProblemId,
          },
        },
        include: { problem: true },
      });

      if (existing) {
        await this.problemAccess.assertCanManage(existing.problemId, actor, 'EDIT');
        await tx.problem.update({
          where: { id: existing.problemId },
          data: {
            title: metadata!.title,
            timeLimit: metadata!.timeLimitMs,
            memoryLimit: metadata!.memoryLimitMb,
          },
        });
        await tx.problemVersion.updateMany({
          where: { problemId: existing.problemId, isCurrent: true },
          data: { description },
        });
        await tx.problemSource.update({
          where: { id: existing.id },
          data: this.sourceData(metadata!, metadataHash, capabilityJson),
        });
        return { created: false, problemId: existing.problemId, ...metadata };
      }

      const problem = await tx.problem.create({
        data: {
          createdById: actor.id,
          title: metadata!.title,
          source: 'EXTERNAL',
          status: 'PUBLISHED',
          difficulty: 'POINT_1',
          timeLimit: metadata!.timeLimitMs,
          memoryLimit: metadata!.memoryLimitMb,
          allowLanguages: [],
          versions: { create: { version: 1, description } },
          tags: { create: [{ name: 'AtCoder', type: 'SOURCE' }] },
          sourceInfo: {
            create: {
              platform: ATCODER_PLATFORM,
              remoteProblemId: metadata!.remoteProblemId,
              ...this.sourceData(metadata!, metadataHash, capabilityJson),
            },
          },
        },
      });

      return { created: true, problemId: problem.id, ...metadata };
    });
  }

  private sourceData(
    metadata: AtCoderProblemMetadata,
    metadataHash: string,
    capabilityJson: object,
  ) {
    return {
      remoteUrl: metadata.remoteUrl,
      remoteContestId: metadata.contestScreenName,
      remoteTaskScreenName: metadata.taskScreenName,
      remoteProblemIndex: metadata.remoteProblemIndex,
      metadataHash,
      capabilityJson,
      lastErrorCode: null,
      syncStatus: 'SYNCED',
      lastSyncAt: new Date(),
    };
  }

  private async ensurePlatform() {
    return this.prisma.externalPlatform.upsert({
      where: { code: ATCODER_PLATFORM },
      create: {
        code: ATCODER_PLATFORM,
        name: 'AtCoder',
        baseUrl: 'https://atcoder.jp',
        enabled: this.config.get('VJUDGE_ATCODER_ENABLED', 'true') !== 'false',
        readOnly: true,
        allowAutoSubmit: false,
        requireUserConfirmation: true,
        supportsMetadata: true,
        supportsStatement: false,
        supportsBrowserSubmission: false,
        supportsOfficialSubmissionApi: false,
        supportsOfficialResultApi: false,
        allowLiveContestSubmission: false,
        adapterVersion: ATCODER_ADAPTER_VERSION,
      },
      update: {
        name: 'AtCoder',
        baseUrl: 'https://atcoder.jp',
        readOnly: true,
        allowAutoSubmit: false,
        requireUserConfirmation: true,
        supportsMetadata: true,
        supportsStatement: false,
        supportsBrowserSubmission: false,
        supportsOfficialSubmissionApi: false,
        supportsOfficialResultApi: false,
        allowLiveContestSubmission: false,
        adapterVersion: ATCODER_ADAPTER_VERSION,
      },
    });
  }

  private rethrowAdapterError(error: unknown): never {
    if (!(error instanceof AtCoderAdapterError)) throw error;
    if (
      error.code === 'INVALID_REMOTE_URL' ||
      error.code === 'REMOTE_NOT_FOUND'
    ) {
      throw new BadRequestException(error.message);
    }
    if (
      error.code === 'REMOTE_RATE_LIMITED' ||
      error.code === 'REMOTE_FORBIDDEN'
    ) {
      throw new ServiceUnavailableException(error.message);
    }
    throw new BadGatewayException(error.message);
  }

  private isEnvironmentEnabled(): boolean {
    return this.config.get('VJUDGE_ATCODER_ENABLED', 'true') !== 'false';
  }
}
