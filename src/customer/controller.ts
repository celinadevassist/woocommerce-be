import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CustomerService } from './service';
import { QueryCustomerDto, QueryCustomerSchema } from './dto.query';
import { UpdateCustomerDto, UpdateCustomerSchema, AddCustomerNoteDto, AddCustomerNoteSchema } from './dto.update';
import {
  CreateSegmentDto,
  CreateSegmentSchema,
  UpdateSegmentDto,
  UpdateSegmentSchema,
} from './segment.dto';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';
import { CustomerStatus, CustomerSource, CustomerTier } from './enum';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller(':lang/customers')
@UseGuards(AuthGuard('jwt'))
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiOperation({ summary: 'Get all customers with filtering' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'status', enum: CustomerStatus, required: false })
  @ApiQuery({ name: 'source', enum: CustomerSource, required: false })
  @ApiQuery({ name: 'tier', enum: CustomerTier, required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ query: QueryCustomerSchema, param: { lang: LanguageSchema } }))
  async findAll(@User('_id') userId: string, @Query() query: QueryCustomerDto) {
    return this.customerService.findAll(userId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get customer statistics' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getStats(@User('_id') userId: string, @Query('storeId') storeId?: string) {
    return this.customerService.getStats(userId, storeId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get customer analytics and insights' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter', 'year'] })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getAnalytics(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
    @Query('period') period?: 'week' | 'month' | 'quarter' | 'year',
  ) {
    return this.customerService.getAnalytics(userId, storeId, period);
  }

  @Post('recalculate-stats')
  @ApiOperation({ summary: 'Recalculate all customer stats from orders' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiResponse({ status: 200, description: 'Returns count of updated customers' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async recalculateStats(
    @User('_id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.customerService.recalculateAllStats(userId, storeId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export customers to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @UsePipes(new JoiValidationPipe({ query: QueryCustomerSchema, param: { lang: LanguageSchema } }))
  async exportCsv(
    @User('_id') userId: string,
    @Query() query: QueryCustomerDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.customerService.exportToCsv(userId, query);
    const filename = `customers-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.customerService.findById(id, userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateCustomerSchema, param: { lang: LanguageSchema } }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, userId, dto);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add note to customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({ status: 200, description: 'Note added' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @UsePipes(new JoiValidationPipe({ body: AddCustomerNoteSchema, param: { lang: LanguageSchema } }))
  async addNote(
    @Param('id') id: string,
    @User() user: UserDocument,
    @Body() dto: AddCustomerNoteDto,
  ) {
    const userName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;
    return this.customerService.addNote(id, user._id.toString(), userName, dto);
  }

  @Delete(':id/notes/:noteId')
  @ApiOperation({ summary: 'Delete note from customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiParam({ name: 'noteId', description: 'Note ID' })
  @ApiResponse({ status: 200, description: 'Note deleted' })
  @ApiResponse({ status: 404, description: 'Customer or note not found' })
  async deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @User('_id') userId: string,
  ) {
    return this.customerService.deleteNote(id, noteId, userId);
  }

  // ==================== Customer Merge ====================

  @Post(':id/merge/:secondaryId')
  @ApiOperation({ summary: 'Merge two customers (combine into one)' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Primary customer ID (will be kept)' })
  @ApiParam({ name: 'secondaryId', description: 'Secondary customer ID (will be merged and deleted)' })
  @ApiResponse({ status: 200, description: 'Customers merged successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async mergeCustomers(
    @Param('id') primaryId: string,
    @Param('secondaryId') secondaryId: string,
  ) {
    return this.customerService.mergeCustomers(primaryId, secondaryId);
  }

  // ==================== Phone Number Management ====================

  @Post(':id/phones')
  @ApiOperation({ summary: 'Add phone number to customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiResponse({ status: 200, description: 'Phone added' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async addPhone(
    @Param('id') id: string,
    @Body() dto: { phone: string; source?: string },
  ) {
    return this.customerService.addPhoneNumber(id, dto.phone, dto.source || 'manual');
  }

  @Delete(':id/phones/:phone')
  @ApiOperation({ summary: 'Remove phone number from customer' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiParam({ name: 'phone', description: 'Phone number (URL encoded)' })
  @ApiResponse({ status: 200, description: 'Phone removed' })
  @ApiResponse({ status: 404, description: 'Customer or phone not found' })
  async removePhone(
    @Param('id') id: string,
    @Param('phone') phone: string,
  ) {
    return this.customerService.removePhoneNumber(id, decodeURIComponent(phone));
  }

  @Put(':id/phones/:phone/verify')
  @ApiOperation({ summary: 'Verify or unverify a phone number' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiParam({ name: 'phone', description: 'Phone number (URL encoded)' })
  @ApiResponse({ status: 200, description: 'Phone verification updated' })
  @ApiResponse({ status: 404, description: 'Customer or phone not found' })
  async verifyPhone(
    @Param('id') id: string,
    @Param('phone') phone: string,
    @Body() dto: { isVerified: boolean },
    @User('_id') userId: string,
  ) {
    return this.customerService.setPhoneVerification(id, decodeURIComponent(phone), dto.isVerified, userId);
  }

  @Put(':id/phones/:phone/primary')
  @ApiOperation({ summary: 'Set phone number as primary' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'id', description: 'Customer ID' })
  @ApiParam({ name: 'phone', description: 'Phone number (URL encoded)' })
  @ApiResponse({ status: 200, description: 'Primary phone updated' })
  @ApiResponse({ status: 404, description: 'Customer or phone not found' })
  async setPrimaryPhone(
    @Param('id') id: string,
    @Param('phone') phone: string,
  ) {
    return this.customerService.setPrimaryPhone(id, decodeURIComponent(phone));
  }

  // ==================== Customer Segments ====================

  @Get('segments/list')
  @ApiOperation({ summary: 'Get all customer segments' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getSegments(@User('_id') userId: string) {
    return this.customerService.getSegments(userId);
  }

  @Post('segments')
  @ApiOperation({ summary: 'Create a customer segment' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @UsePipes(new JoiValidationPipe({ body: CreateSegmentSchema, param: { lang: LanguageSchema } }))
  async createSegment(
    @User('_id') userId: string,
    @Body() dto: CreateSegmentDto,
  ) {
    return this.customerService.createSegment(userId, dto);
  }

  @Put('segments/:segmentId')
  @ApiOperation({ summary: 'Update a customer segment' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateSegmentSchema, param: { lang: LanguageSchema } }))
  async updateSegment(
    @User('_id') userId: string,
    @Param('segmentId') segmentId: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.customerService.updateSegment(segmentId, userId, dto);
  }

  @Delete('segments/:segmentId')
  @ApiOperation({ summary: 'Delete a customer segment' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async deleteSegment(
    @User('_id') userId: string,
    @Param('segmentId') segmentId: string,
  ) {
    await this.customerService.deleteSegment(segmentId, userId);
    return { success: true };
  }

  @Get('segments/:segmentId/customers')
  @ApiOperation({ summary: 'Get customers in a segment' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiParam({ name: 'segmentId', description: 'Segment ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getSegmentCustomers(
    @User('_id') userId: string,
    @Param('segmentId') segmentId: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.customerService.getSegmentCustomers(
      segmentId,
      userId,
      page ? parseInt(page) : 1,
      size ? parseInt(size) : 20,
    );
  }
}
