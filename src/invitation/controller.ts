import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InvitationService } from './service';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';

@ApiTags('Invitation')
@Controller(':lang/invitation')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post('send')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an invitation to join a store' })
  @ApiResponse({ status: 201, description: 'Invitation sent successfully' })
  async sendInvitation(
    @Body() body: {
      storeId: string;
      email: string;
      role: string;
    },
    @User() user: UserDocument,
  ) {
    return this.invitationService.sendInvitation(
      body.storeId,
      user._id.toString(),
      body.email,
      body.role,
    );
  }

  @Get('token/:token')
  @ApiOperation({ summary: 'Get invitation details by token' })
  @ApiResponse({ status: 200, description: 'Invitation details' })
  async getInvitationByToken(@Param('token') token: string) {
    return this.invitationService.getInvitationByToken(token);
  }

  @Post('accept/:token')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an invitation' })
  @ApiResponse({ status: 200, description: 'Invitation accepted' })
  async acceptInvitation(
    @Param('token') token: string,
    @User() user: UserDocument,
  ) {
    return this.invitationService.acceptInvitation(token, user._id.toString());
  }

  @Get('store/:storeId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending invitations for a store' })
  @ApiResponse({ status: 200, description: 'List of pending invitations' })
  async getStoreInvitations(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return this.invitationService.getStoreInvitations(
      storeId,
      user._id.toString(),
    );
  }

  @Delete(':invitationId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @User() user: UserDocument,
  ) {
    return this.invitationService.revokeInvitation(invitationId, user._id.toString());
  }

  @Post(':invitationId/resend')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend an invitation email' })
  @ApiResponse({ status: 200, description: 'Invitation resent' })
  async resendInvitation(
    @Param('invitationId') invitationId: string,
    @User() user: UserDocument,
  ) {
    return this.invitationService.resendInvitation(invitationId, user._id.toString());
  }

  @Get('pending')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pending invitations for current user' })
  @ApiResponse({ status: 200, description: 'List of pending invitations' })
  async getUserPendingInvitations(@User() user: UserDocument) {
    return this.invitationService.getUserPendingInvitations(user.email);
  }
}
