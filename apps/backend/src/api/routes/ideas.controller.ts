import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import {
  IdeasService,
  IdeaStage,
} from '@gitroom/nestjs-libraries/ideas/ideas.service';

@ApiTags('Ideas')
@Controller('/ideas')
export class IdeasController {
  constructor(private _ideasService: IdeasService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization) {
    return this._ideasService.list(org.id);
  }

  @Put('/:group/stage')
  move(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string,
    @Body('stage') stage: IdeaStage
  ) {
    return this._ideasService.move(org.id, group, stage);
  }

  @Post('/:group/schedule')
  schedule(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    return this._ideasService.schedule(org.id, group);
  }
}
