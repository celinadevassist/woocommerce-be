import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from './service';
import { AuditAction, AuditSeverity } from './schema';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';

@ApiTags('Audit Log')
@Controller(':lang/audit-log')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('organization/:organizationId')
  @ApiOperation({ summary: 'Get audit logs for an organization' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getOrganizationAuditLogs(
    @Param('organizationId') organizationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('action') action?: AuditAction,
    @Query('resourceType') resourceType?: string,
    @Query('severity') severity?: AuditSeverity,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @User() user?: UserDocument,
  ) {
    return this.auditLogService.getOrganizationAuditLogs(organizationId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      action,
      resourceType,
      severity,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('organization/:organizationId/recent')
  @ApiOperation({ summary: 'Get recent activity for an organization' })
  @ApiResponse({ status: 200, description: 'Recent activity retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getRecentActivity(
    @Param('organizationId') organizationId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogService.getRecentActivity(
      organizationId,
      limit ? Number(limit) : 10,
    );
  }

  @Get('organization/:organizationId/summary')
  @ApiOperation({ summary: 'Get activity summary for an organization' })
  @ApiResponse({ status: 200, description: 'Activity summary retrieved successfully' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getActivitySummary(
    @Param('organizationId') organizationId: string,
    @Query('days') days?: number,
  ) {
    return this.auditLogService.getActivitySummary(
      organizationId,
      days ? Number(days) : 30,
    );
  }

  @Get('store/:storeId')
  @ApiOperation({ summary: 'Get audit logs for a store' })
  @ApiResponse({ status: 200, description: 'Store audit logs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getStoreAuditLogs(
    @Param('storeId') storeId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('action') action?: AuditAction,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.auditLogService.getStoreAuditLogs(storeId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      action,
      resourceType,
    });
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get audit logs for a user' })
  @ApiResponse({ status: 200, description: 'User audit logs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogService.getUserAuditLogs(userId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }
}
