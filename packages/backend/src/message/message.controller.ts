import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessageService } from './message.service';

@Controller('api/messages')
@UseGuards(AuthGuard('jwt'))
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get('contacts')
  searchContacts(@Req() req: any, @Query('keyword') keyword?: string) {
    return this.messages.searchContacts(req.user.id, keyword);
  }

  @Get('conversations')
  listConversations(@Req() req: any) {
    return this.messages.listConversations(req.user.id);
  }

  @Get('conversations/:id')
  getConversation(@Req() req: any, @Param('id') id: string) {
    return this.messages.getConversation(req.user.id, id);
  }

  @Post()
  sendMessage(@Req() req: any, @Body() body: { recipientId?: string; content?: string }) {
    return this.messages.sendMessage(req.user.id, body);
  }
}
