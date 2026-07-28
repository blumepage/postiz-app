import { Controller, Get, Param, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostizCloudService } from '@gitroom/nestjs-libraries/integrations/postiz.cloud.service';

@ApiTags('Analytics')
@Controller('/analytics')
export class AnalyticsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _postizCloudService: PostizCloudService
  ) {}

  @Get('/:integration')
  async getIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    const localIntegration = await this._integrationService.getIntegrationById(
      org.id,
      integration
    );
    if (!localIntegration && this._postizCloudService.enabled) {
      return this._postizCloudService.getAnalytics(integration, date);
    }
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Get('/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    const localPost = await this._postsService.getPostById(postId, org.id);
    if (!localPost && this._postizCloudService.enabled) {
      return this._postizCloudService.getPostAnalytics(postId, +date);
    }
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }
}
