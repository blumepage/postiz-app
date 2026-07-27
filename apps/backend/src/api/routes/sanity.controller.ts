import { Controller, Get, Param, Post } from '@nestjs/common';
import { SanityService } from '@gitroom/backend/services/sanity/sanity.service';

@Controller('/sanity')
export class SanityController {
  constructor(private readonly sanityService: SanityService) {}

  @Get('/articles')
  listArticles() {
    return this.sanityService.listArticles();
  }

  @Post('/articles/:id/schedule')
  scheduleArticle(@Param('id') id: string) {
    return this.sanityService.scheduleArticle(id);
  }
}
