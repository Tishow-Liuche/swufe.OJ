import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommunityService } from './community.service';

@Controller('api/community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('announcements')
  listAnnouncements() {
    return this.community.listAnnouncements();
  }

  @Get('posts')
  listPosts(
    @Query('type') type?: string,
    @Query('problemId') problemId?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
  ) {
    return this.community.listPosts({ type, problemId, category, keyword, sort });
  }

  @Get('posts/:id')
  @UseGuards(AuthGuard('jwt'))
  getPost(@Param('id') id: string, @Req() req: any) {
    return this.community.getPost(id, req.user);
  }

  @Post('posts')
  @UseGuards(AuthGuard('jwt'))
  createPost(@Req() req: any, @Body() body: any) {
    return this.community.createPost(req.user, body);
  }

  @Post('images')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadImage(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.community.uploadCommunityImage(req.user, file);
  }

  @Post('posts/:id/replies')
  @UseGuards(AuthGuard('jwt'))
  createReply(
    @Param('id') id: string,
    @Req() req: any,
    @Body('content') content: string,
    @Body('parentReplyId') parentReplyId?: string,
  ) {
    return this.community.createReply(id, req.user, content, parentReplyId);
  }

  @Post('replies/:id/reaction')
  @UseGuards(AuthGuard('jwt'))
  reactToReply(@Param('id') id: string, @Req() req: any) {
    return this.community.toggleReplyReaction(id, req.user);
  }

  @Post('posts/:id/reaction')
  @UseGuards(AuthGuard('jwt'))
  reactToPost(@Param('id') id: string, @Req() req: any) {
    return this.community.toggleReaction(id, req.user);
  }

  @Patch('posts/:id/resolved')
  @UseGuards(AuthGuard('jwt'))
  markPostResolved(@Param('id') id: string, @Req() req: any, @Body('resolved') resolved: boolean) {
    return this.community.markPostResolved(id, req.user, resolved);
  }

  @Post('reports')
  @UseGuards(AuthGuard('jwt'))
  createReport(@Req() req: any, @Body() body: any) {
    return this.community.createReport(req.user, body);
  }

  @Post('feedback')
  @UseGuards(AuthGuard('jwt'))
  createProblemFeedback(@Req() req: any, @Body() body: any) {
    return this.community.createProblemFeedback(req.user, body);
  }

  @Get('notifications')
  @UseGuards(AuthGuard('jwt'))
  getNotifications(@Req() req: any) {
    return this.community.getNotifications(req.user.id);
  }

  @Patch('notifications/:id/read')
  @UseGuards(AuthGuard('jwt'))
  markNotificationRead(@Param('id') id: string, @Req() req: any) {
    return this.community.markNotificationRead(id, req.user.id);
  }

  @Post('notifications/read-all')
  @UseGuards(AuthGuard('jwt'))
  markAllNotificationsRead(@Req() req: any) {
    return this.community.markAllNotificationsRead(req.user.id);
  }

  @Post('announcements')
  @UseGuards(AuthGuard('jwt'))
  createAnnouncement(@Req() req: any, @Body() body: any) {
    return this.community.createAnnouncement(req.user, body);
  }

  @Get('moderation/overview')
  @UseGuards(AuthGuard('jwt'))
  moderationOverview(@Req() req: any) {
    return this.community.getModerationOverview(req.user);
  }

  @Get('moderation/reports')
  @UseGuards(AuthGuard('jwt'))
  listReports(@Req() req: any, @Query('status') status?: string) {
    return this.community.listReports(req.user, status);
  }

  @Patch('moderation/reports/:id')
  @UseGuards(AuthGuard('jwt'))
  reviewReport(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.community.reviewReport(id, req.user, body);
  }

  @Get('moderation/feedback')
  @UseGuards(AuthGuard('jwt'))
  listProblemFeedback(@Req() req: any, @Query('status') status?: string) {
    return this.community.listProblemFeedback(req.user, status);
  }

  @Patch('moderation/feedback/:id')
  @UseGuards(AuthGuard('jwt'))
  reviewProblemFeedback(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.community.reviewProblemFeedback(id, req.user, body);
  }
}
