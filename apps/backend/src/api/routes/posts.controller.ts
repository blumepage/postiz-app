import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization, User } from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { ApiTags } from '@nestjs/swagger';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { Response } from 'express';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { PostValidationException } from '@gitroom/backend/api/routes/posts.validation.exception';
import { PostizCloudService } from '@gitroom/nestjs-libraries/integrations/postiz.cloud.service';
import {
  minifyPosts,
  minifyPostsList,
} from '@gitroom/helpers/utils/posts.list.minify';

@ApiTags('Posts')
@Controller('/posts')
export class PostsController {
  constructor(
    private _postsService: PostsService,
    private _agentGraphService: AgentGraphService,
    private _shortLinkService: ShortLinkService,
    private _postizCloudService: PostizCloudService
  ) {}

  private assertValidPosts(validation: any[], type: string) {
    const fail = (item: any, error: string) => {
      throw new PostValidationException({
        provider: item.identifier,
        name: item.name,
        error,
      });
    };

    for (const item of validation) {
      if (item.emptyContent) {
        fail(
          item,
          'Your post should have at least one character or one image.'
        );
      }
    }

    if (type !== 'draft') {
      for (const item of validation) {
        if (!item.valid) {
          fail(item, item.settingsError || 'Please fix your settings');
        }
        if (item.errors !== true) {
          fail(item, item.errors as string);
        }
        if (item.tooLong) {
          fail(item, 'post is too long, please fix it');
        }
      }
    }
  }

  @Get('/:id/statistics')
  async getStatistics(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.getStatistics(org.id, id);
  }

  @Get('/:id/missing')
  async getMissingContent(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.getMissingContent(org.id, id);
  }

  @Put('/:id/release-id')
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('releaseId') releaseId: string
  ) {
    return this._postsService.updateReleaseId(org.id, id, releaseId);
  }

  @Post('/should-shortlink')
  async shouldShortlink(@Body() body: { messages: string[] }) {
    return { ask: this._shortLinkService.askShortLinkedin(body.messages) };
  }

  @Post('/:id/comments')
  async createComment(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: { comment: string }
  ) {
    return this._postsService.createComment(org.id, user.id, id, body.comment);
  }

  @Get('/tags')
  async getTags(@GetOrgFromRequest() org: Organization) {
    return { tags: await this._postsService.getTags(org.id) };
  }

  @Post('/tags')
  async createTag(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateTagDto
  ) {
    return this._postsService.createTag(org.id, body);
  }

  @Put('/tags/:id')
  async editTag(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateTagDto,
    @Param('id') id: string
  ) {
    return this._postsService.editTag(id, org.id, body);
  }

  @Delete('/tags/:id')
  async deleteTag(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.deleteTag(id, org.id);
  }

  @Get('/')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsDto
  ) {
    const [localPosts, cloudPosts] = await Promise.all([
      this._postsService.getPosts(org.id, query),
      this._postizCloudService.getPosts(org.id, query),
    ]);
    return minifyPosts({
      posts: [
        ...localPosts.filter(
          (post) =>
            !this._postizCloudService.enabled ||
            post.integration.providerIdentifier === 'sanity'
        ),
        ...cloudPosts,
      ],
    });
  }

  @Get('/find-slot')
  async findSlot(@GetOrgFromRequest() org: Organization) {
    if (this._postizCloudService.enabled) {
      const integration = (
        await this._postizCloudService.listIntegrations()
      ).find((item) => !item.disabled);
      if (integration) {
        return this._postizCloudService.findSlot(integration.id);
      }
    }
    return { date: await this._postsService.findFreeDateTime(org.id) };
  }

  @Get('/find-slot/:id')
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id?: string
  ) {
    if (
      id &&
      this._postizCloudService.enabled &&
      (await this._postizCloudService.hasIntegration(id))
    ) {
      return this._postizCloudService.findSlot(id);
    }
    return { date: await this._postsService.findFreeDateTime(org.id, id) };
  }

  @Get('/list')
  async getPostsList(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsListDto
  ) {
    if (!this._postizCloudService.enabled) {
      return this._postsService.getPostsList(org.id, query);
    }

    const [localPosts, cloudPosts] = await Promise.all([
      this._postsService.getPosts(org.id, {
        startDate: '2010-01-01T00:00:00.000Z',
        endDate: '2100-01-01T00:00:00.000Z',
        customer: query.customer || '',
      }),
      this._postizCloudService.getAllPosts(org.id),
    ]);
    const stateMap: Record<string, string> = {
      scheduled: 'QUEUE',
      draft: 'DRAFT',
      published: 'PUBLISHED',
    };
    const allPosts = [
      ...localPosts.filter(
        (post) => post.integration.providerIdentifier === 'sanity'
      ),
      ...cloudPosts,
    ]
      .filter(
        (post) =>
          !query.state ||
          query.state === 'all' ||
          post.state === stateMap[query.state]
      )
      .sort(
        (a, b) =>
          new Date(b.publishDate as any).getTime() -
          new Date(a.publishDate as any).getTime()
      );
    const page = query.page || 0;
    const limit = query.limit || 20;
    const posts = allPosts.slice(page * limit, (page + 1) * limit);

    return minifyPostsList({
      posts,
      total: allPosts.length,
      page,
      limit,
      hasMore: (page + 1) * limit < allPosts.length,
    });
  }

  @Get('/old')
  oldPosts(
    @GetOrgFromRequest() org: Organization,
    @Query('date') date: string
  ) {
    return this._postsService.getOldPosts(org.id, date);
  }

  @Get('/group/:group/debug-export')
  async getPostGroupDebugExport(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('group') group: string
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._postsService.getPostGroupDebugExport(org.id, group);
  }

  @Get('/group/:group')
  async getPostsByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    const cloudPost = await this._postizCloudService.getPostGroup(
      org.id,
      group
    );
    if (cloudPost) {
      return cloudPost;
    }
    return this._postsService.getPostsByGroup(org.id, group);
  }

  @Get('/:id')
  async getPost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const cloudPost = await this._postizCloudService.getPostById(org.id, id);
    if (cloudPost) {
      return cloudPost;
    }
    return this._postsService.getPost(org.id, id);
  }

  @Post('/valid')
  async validatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any
  ) {
    const cloudIntegrations = await this._postizCloudService.listIntegrations();
    const cloudIntegrationMap = new Map(
      cloudIntegrations.map((integration) => [integration.id, integration])
    );
    const rawPosts = rawBody?.posts || [];
    const localPosts = rawPosts.filter(
      (post: any) => !cloudIntegrationMap.has(post?.integration?.id)
    );
    const cloudPosts = rawPosts.filter((post: any) =>
      cloudIntegrationMap.has(post?.integration?.id)
    );
    const localValidation = localPosts.length
      ? await this._postsService.validatePosts(org.id, localPosts)
      : [];
    const cloudValidation = cloudPosts.map((post: any) => {
      const integration = cloudIntegrationMap.get(post.integration.id)!;
      const values = post.value || [];
      const emptyContent = values.every(
        (value: any) =>
          !String(value?.content || '').trim() && !value?.image?.length
      );
      return {
        identifier: integration.identifier,
        name: integration.name,
        emptyContent,
        valid: true,
        errors: true,
        tooLong: false,
      };
    });
    return [...localValidation, ...cloudValidation];
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any
  ) {
    const cloudIntegrations = await this._postizCloudService.listIntegrations();
    const cloudIds = new Set(
      cloudIntegrations.map((integration) => integration.id)
    );
    const cloudPosts = (rawBody?.posts || []).filter((post: any) =>
      cloudIds.has(post?.integration?.id)
    );
    const localPosts = (rawBody?.posts || []).filter(
      (post: any) => !cloudIds.has(post?.integration?.id)
    );
    const validation = localPosts.length
      ? await this._postsService.validatePosts(org.id, localPosts)
      : [];
    this.assertValidPosts(validation, rawBody?.type);

    const output: any[] = [];
    if (cloudPosts.length) {
      const groups = Array.from(
        new Set<string>(
          cloudPosts
            .map((post: any) => post?.group)
            .filter((group: any): group is string => Boolean(group))
        )
      );
      for (const group of groups) {
        await this._postizCloudService.deletePostGroup(org.id, group);
      }
      output.push(
        ...(await this._postizCloudService.createPosts(org.id, {
          ...rawBody,
          posts: cloudPosts,
        }))
      );
    }

    if (!localPosts.length) {
      return output;
    }

    const body = await this._postsService.mapTypeToPost(
      { ...rawBody, posts: localPosts },
      org.id
    );
    const localOutput = await this._postsService.createPost(
      org.id,
      body,
      'WEB'
    );
    return [
      ...output,
      ...(Array.isArray(localOutput) ? localOutput : [localOutput]),
    ];
  }

  @Post('/generator/draft')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  generatePostsDraft(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateGeneratedPostsDto
  ) {
    return this._postsService.generatePostsDraft(org.id, body);
  }

  @Post('/generator')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async generatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GeneratorDto,
    @Res({ passthrough: false }) res: Response
  ) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      for await (const event of this._agentGraphService.start(org.id, body)) {
        res.write(JSON.stringify(event) + '\n');
      }
    } catch (err) {
      // The stream has already started, so we cannot surface a normal HTTP
      // error here. Emit a final error event on the open stream instead, so the
      // client can stop and show the message rather than hang on a truncated
      // stream. HttpExceptions carry a curated, user-facing message (e.g. the
      // AI safety rejection); anything else gets a generic message.
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong while generating your posts, please try again.';
      res.write(JSON.stringify({ name: 'error', error: true, message }) + '\n');
    }

    res.end();
  }

  @Delete('/:group')
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    const cloudPost = await this._postizCloudService.getPostGroup(
      org.id,
      group
    );
    if (cloudPost) {
      return this._postizCloudService.deletePostGroup(org.id, group);
    }
    return this._postsService.deletePost(org.id, group);
  }

  @Put('/:id/status')
  async changePostStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('status') status: 'draft' | 'schedule'
  ) {
    const cloudPost = await this._postizCloudService.getPostById(org.id, id);
    if (cloudPost) {
      return this._postizCloudService.changePostStatus(id, status);
    }
    return this._postsService.changePostStatus(org.id, id, status);
  }

  @Put('/:id/date')
  async changeDate(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('date') date: string,
    @Body('action') action: 'schedule' | 'update' = 'schedule'
  ) {
    const cloudPost = await this._postizCloudService.getPostById(org.id, id);
    if (cloudPost) {
      await this._postizCloudService.reschedulePostGroup(
        org.id,
        cloudPost.group,
        date
      );
      return { status: 'success' };
    }
    return this._postsService.changeDate(org.id, id, date, action);
  }

  @Post('/separate-posts')
  async separatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { content: string; len: number }
  ) {
    return this._postsService.separatePosts(body.content, body.len);
  }
}
