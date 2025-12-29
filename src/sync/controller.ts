import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SyncService } from './service';
import { ScheduledSyncService } from './scheduled-sync.service';
import { SyncJobType, SyncEntityType, SyncMode } from './enum';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Sync')
@ApiBearerAuth()
@Controller(':lang/sync')
@UseGuards(AuthGuard('jwt'))
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly scheduledSyncService: ScheduledSyncService,
  ) {}

  @Post('store/:storeId/products')
  @ApiOperation({ summary: 'Start product sync for a store' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 400, description: 'Sync already in progress' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: SyncMode,
    description: 'Sync mode: "full" for all products, "delta" for only modified since last sync',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async startProductSync(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
    @Query('mode') mode?: SyncMode,
  ) {
    const syncMode = mode === SyncMode.DELTA ? SyncMode.DELTA : SyncMode.FULL;
    return await this.syncService.startProductSync(storeId, user._id.toString(), SyncJobType.MANUAL, syncMode);
  }

  @Post('store/:storeId/orders')
  @ApiOperation({ summary: 'Start order sync for a store' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 400, description: 'Sync already in progress' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: SyncMode,
    description: 'Sync mode: "full" for all orders, "delta" for only modified since last sync',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async startOrderSync(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
    @Query('mode') mode?: SyncMode,
  ) {
    const syncMode = mode === SyncMode.DELTA ? SyncMode.DELTA : SyncMode.FULL;
    return await this.syncService.startOrderSync(storeId, user._id.toString(), SyncJobType.MANUAL, syncMode);
  }

  @Post('store/:storeId/customers')
  @ApiOperation({ summary: 'Start customer sync for a store' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 400, description: 'Sync already in progress' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async startCustomerSync(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.startCustomerSync(storeId, user._id.toString(), SyncJobType.MANUAL);
  }

  @Post('store/:storeId/reviews')
  @ApiOperation({ summary: 'Start review sync for a store' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 400, description: 'Sync already in progress' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async startReviewSync(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.startReviewSync(storeId, user._id.toString(), SyncJobType.MANUAL);
  }

  @Post('store/:storeId/full')
  @ApiOperation({ summary: 'Start sync for all entity types' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: SyncMode,
    description: 'Sync mode: "full" for all records, "delta" for only modified since last sync (products & orders only)',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async startFullSync(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
    @Query('mode') mode?: string,
  ) {
    const syncMode = mode === SyncMode.DELTA ? SyncMode.DELTA : SyncMode.FULL;
    return await this.syncService.startFullSync(storeId, user._id.toString(), syncMode);
  }

  @Post('job/:jobId/pause')
  @ApiOperation({ summary: 'Pause a running sync job' })
  @ApiResponse({ status: 200, description: 'Sync paused successfully' })
  @ApiResponse({ status: 400, description: 'Cannot pause this sync' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async pauseSync(
    @Param('jobId') jobId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.pauseSync(jobId);
  }

  @Post('job/:jobId/resume')
  @ApiOperation({ summary: 'Resume a paused sync job' })
  @ApiResponse({ status: 200, description: 'Sync resumed successfully' })
  @ApiResponse({ status: 400, description: 'Cannot resume this sync' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async resumeSync(
    @Param('jobId') jobId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.resumeSync(jobId);
  }

  @Post('job/:jobId/cancel')
  @ApiOperation({ summary: 'Cancel a sync job' })
  @ApiResponse({ status: 200, description: 'Sync cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel this sync' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async cancelSync(
    @Param('jobId') jobId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.cancelSync(jobId);
  }

  @Post('store/:storeId/reset-stuck')
  @ApiOperation({ summary: 'Reset stuck sync jobs for a store' })
  @ApiResponse({ status: 200, description: 'Stuck jobs reset successfully' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async resetStuckJobs(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.resetStuckJobs(storeId);
  }

  @Get('store/:storeId/progress')
  @ApiOperation({ summary: 'Get sync progress for a store' })
  @ApiResponse({ status: 200, description: 'Progress retrieved successfully' })
  @ApiQuery({ name: 'entityType', required: false, enum: SyncEntityType })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getSyncProgress(
    @Param('storeId') storeId: string,
    @Query('entityType') entityType: SyncEntityType,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.getSyncProgress(storeId, entityType);
  }

  @Get('store/:storeId/jobs')
  @ApiOperation({ summary: 'Get sync jobs for a store' })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getSyncJobs(
    @Param('storeId') storeId: string,
    @Query('page') page: number = 1,
    @Query('size') size: number = 10,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.getSyncJobs(storeId, page, size);
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Get sync job details' })
  @ApiResponse({ status: 200, description: 'Job retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getSyncJob(
    @Param('jobId') jobId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.syncService.getSyncJob(jobId);
  }

  // ==================== SCHEDULED SYNC ====================

  @Get('store/:storeId/schedule')
  @ApiOperation({ summary: 'Get scheduled sync settings for a store' })
  @ApiResponse({ status: 200, description: 'Settings retrieved successfully' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getScheduledSyncStatus(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.scheduledSyncService.getScheduledSyncStatus(storeId);
  }

  @Patch('store/:storeId/schedule')
  @ApiOperation({ summary: 'Update scheduled sync settings for a store' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async updateScheduledSyncSettings(
    @Param('storeId') storeId: string,
    @Body() body: { autoSync?: boolean; syncInterval?: number },
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    await this.scheduledSyncService.updateScheduledSyncSettings(storeId, body);
    return { message: 'Scheduled sync settings updated successfully' };
  }
}
