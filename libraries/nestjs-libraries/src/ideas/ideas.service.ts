import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostizCloudService } from '@gitroom/nestjs-libraries/integrations/postiz.cloud.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

export const ideaStages = ['INBOX', 'PICKED', 'POLISHED'] as const;
export type IdeaStage = (typeof ideaStages)[number];

const isIdeaStage = (value: string): value is IdeaStage =>
  ideaStages.includes(value as IdeaStage);

@Injectable()
export class IdeasService {
  constructor(
    private _postsService: PostsService,
    private _postizCloudService: PostizCloudService
  ) {}

  private stagesKey(organizationId: string) {
    return `postiz:ideas:${organizationId}:stages`;
  }

  private async getSourcePosts(organizationId: string) {
    const [localPosts, cloudPosts] = await Promise.all([
      this._postsService.getPosts(organizationId, {
        startDate: '2010-01-01T00:00:00.000Z',
        endDate: '2100-01-01T00:00:00.000Z',
        customer: '',
      }),
      this._postizCloudService.getAllPosts(organizationId),
    ]);

    return {
      localPosts: localPosts
        .filter(
          (post) =>
            !this._postizCloudService.enabled ||
            post.integration.providerIdentifier === 'sanity'
        )
        .map((post) => ({ ...post, remote: false })),
      cloudPosts: cloudPosts.map((post) => ({ ...post, remote: true })),
    };
  }

  async list(organizationId: string) {
    const [{ localPosts, cloudPosts }, storedStages] = await Promise.all([
      this.getSourcePosts(organizationId),
      ioRedis.hgetall(this.stagesKey(organizationId)),
    ]);

    const grouped = new Map<
      string,
      {
        group: string;
        stage: IdeaStage | 'SCHEDULED';
        publishDate: string | Date;
        posts: any[];
      }
    >();

    for (const post of [...localPosts, ...cloudPosts]) {
      if (post.state !== 'DRAFT' && post.state !== 'QUEUE') {
        continue;
      }
      if (
        post.state === 'QUEUE' &&
        new Date(post.publishDate).getTime() < Date.now()
      ) {
        continue;
      }

      const storedStage = storedStages[post.group];
      const stage =
        post.state === 'QUEUE'
          ? 'SCHEDULED'
          : isIdeaStage(storedStage)
          ? storedStage
          : 'INBOX';
      const existing = grouped.get(post.group);

      if (existing) {
        existing.posts.push({
          ...post,
          tags: post.tags || [],
        });
        if (
          new Date(post.publishDate).getTime() <
          new Date(existing.publishDate).getTime()
        ) {
          existing.publishDate = post.publishDate;
        }
        continue;
      }

      grouped.set(post.group, {
        group: post.group,
        stage,
        publishDate: post.publishDate,
        posts: [
          {
            ...post,
            tags: post.tags || [],
          },
        ],
      });
    }

    return {
      ideas: Array.from(grouped.values()).sort((left, right) => {
        if (left.stage === 'SCHEDULED' && right.stage !== 'SCHEDULED') {
          return 1;
        }
        if (right.stage === 'SCHEDULED' && left.stage !== 'SCHEDULED') {
          return -1;
        }
        return (
          new Date(left.publishDate).getTime() -
          new Date(right.publishDate).getTime()
        );
      }),
    };
  }

  async move(organizationId: string, group: string, stage: string) {
    if (!isIdeaStage(stage)) {
      throw new BadRequestException('Invalid idea stage');
    }

    const { localPosts, cloudPosts } = await this.getSourcePosts(
      organizationId
    );
    const groupPosts = [...localPosts, ...cloudPosts].filter(
      (post) => post.group === group && post.state === 'DRAFT'
    );
    if (!groupPosts.length) {
      throw new NotFoundException('Draft idea not found');
    }

    await ioRedis.hset(this.stagesKey(organizationId), group, stage);
    return { group, stage };
  }

  async schedule(organizationId: string, group: string) {
    const { localPosts, cloudPosts } = await this.getSourcePosts(
      organizationId
    );
    const localGroup = localPosts.filter(
      (post) => post.group === group && post.state === 'DRAFT'
    );
    const cloudGroup = cloudPosts.filter(
      (post) => post.group === group && post.state === 'DRAFT'
    );

    if (!localGroup.length && !cloudGroup.length) {
      throw new NotFoundException('Draft idea not found');
    }

    let date: string;
    if (cloudGroup.length) {
      const slot = await this._postizCloudService.findSlot(
        cloudGroup[0].integration.id
      );
      date = slot.date;
      await this._postizCloudService.schedulePostGroup(
        organizationId,
        group,
        date
      );
    } else {
      date = await this._postsService.findFreeDateTime(
        organizationId,
        localGroup[0].integration.id
      );
      await this._postsService.schedulePostGroup(organizationId, group, date);
    }

    await ioRedis.hdel(this.stagesKey(organizationId), group);
    return { group, stage: 'SCHEDULED' as const, date };
  }
}
