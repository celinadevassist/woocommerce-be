import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';
import { RunningCostsService } from './service';
import {
  CreateCostTemplateDto,
  CreateCostTemplateSchema,
  UpdateCostTemplateDto,
  UpdateCostTemplateSchema,
  CreateCostEntryDto,
  CreateCostEntrySchema,
  UpdateCostEntryDto,
  UpdateCostEntrySchema,
  QueryCostTemplateDto,
  QueryCostTemplateSchema,
  QueryCostEntryDto,
  QueryCostEntrySchema,
  QueryMonthlySummaryDto,
  QueryMonthlySummarySchema,
  BulkCreateEntriesDto,
  BulkCreateEntriesSchema,
} from './dto';

@ApiTags('Running Costs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/running-costs')
export class RunningCostsController {
  constructor(private readonly costsService: RunningCostsService) {}

  // ========================
  // Cost Templates
  // ========================

  @Get('templates')
  @ApiOperation({ summary: 'Get all cost templates' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  @UsePipes(new JoiValidationPipe({ query: QueryCostTemplateSchema }))
  async getTemplates(@User('_id') userId: string, @Query() query: QueryCostTemplateDto) {
    return this.costsService.getTemplates(userId, query);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get cost template by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async getTemplateById(@User('_id') userId: string, @Param('id') id: string) {
    return this.costsService.getTemplateById(userId, id);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create cost template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateCostTemplateSchema }))
  async createTemplate(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateCostTemplateDto,
  ) {
    return this.costsService.createTemplate(storeId, userId, dto);
  }

  @Put('templates/:id')
  @ApiOperation({ summary: 'Update cost template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateCostTemplateSchema }))
  async updateTemplate(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCostTemplateDto,
  ) {
    return this.costsService.updateTemplate(userId, id, dto);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete cost template' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Template ID' })
  async deleteTemplate(@User('_id') userId: string, @Param('id') id: string) {
    await this.costsService.deleteTemplate(userId, id);
    return { message: 'Cost template deleted successfully' };
  }

  // ========================
  // Cost Entries
  // ========================

  @Get('entries')
  @ApiOperation({ summary: 'Get cost entries with filters' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'month', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'templateId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryCostEntrySchema }))
  async getEntries(@User('_id') userId: string, @Query() query: QueryCostEntryDto) {
    return this.costsService.getEntries(userId, query);
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get cost entry by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  async getEntryById(@User('_id') userId: string, @Param('id') id: string) {
    return this.costsService.getEntryById(userId, id);
  }

  @Post('entries')
  @ApiOperation({ summary: 'Create cost entry' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateCostEntrySchema }))
  async createEntry(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateCostEntryDto,
  ) {
    return this.costsService.createEntry(storeId, userId, dto);
  }

  @Post('entries/bulk')
  @ApiOperation({ summary: 'Bulk create entries from templates' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: BulkCreateEntriesSchema }))
  async bulkCreateEntries(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: BulkCreateEntriesDto,
  ) {
    return this.costsService.bulkCreateEntries(storeId, userId, dto);
  }

  @Put('entries/:id')
  @ApiOperation({ summary: 'Update cost entry' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateCostEntrySchema }))
  async updateEntry(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCostEntryDto,
  ) {
    return this.costsService.updateEntry(userId, id, dto);
  }

  @Delete('entries/:id')
  @ApiOperation({ summary: 'Delete cost entry' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Entry ID' })
  async deleteEntry(@User('_id') userId: string, @Param('id') id: string) {
    await this.costsService.deleteEntry(userId, id);
    return { message: 'Cost entry deleted successfully' };
  }

  // ========================
  // Summary & Analytics
  // ========================

  @Get('summary')
  @ApiOperation({ summary: 'Get cost summary for dashboard' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  async getSummary(@User('_id') userId: string, @Query('storeId') storeId: string) {
    return this.costsService.getCostSummary(userId, storeId);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Get monthly summaries' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'months', required: false, type: Number })
  @ApiQuery({ name: 'startMonth', required: false })
  @ApiQuery({ name: 'endMonth', required: false })
  @UsePipes(new JoiValidationPipe({ query: QueryMonthlySummarySchema }))
  async getMonthlySummaries(@User('_id') userId: string, @Query() query: QueryMonthlySummaryDto) {
    return this.costsService.getMonthlySummaries(userId, query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get available cost categories' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  async getCategories() {
    return this.costsService.getCategories();
  }
}
