import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './service';
import { RolesGuard } from '../guards';
import { Scopes, User } from '../decorators';
import { JoiValidationPipe } from '../pipes';
import { LanguageSchema, MongoIdSchema } from '../dtos';
import { UserDocument } from '../schema/user.schema';
import { SkipSubscriptionCheck } from '../subscription/guard';
import {
  AdminQueryUsersDTO,
  AdminQueryUsersSchema,
  AdminQueryStoresDTO,
  AdminQueryStoresSchema,
  AdminQuerySubscriptionsDTO,
  AdminQuerySubscriptionsSchema,
  AdminQueryInvoicesDTO,
  AdminQueryInvoicesSchema,
} from './dto.query';
import {
  AdminUpdateUserDTO,
  AdminUpdateUserSchema,
  AdminSuspendStoreDTO,
  AdminSuspendStoreSchema,
  AdminUpdateSubscriptionDTO,
  AdminUpdateSubscriptionSchema,
  AdminCancelSubscriptionDTO,
  AdminCancelSubscriptionSchema,
  AdminMarkInvoicePaidDTO,
  AdminMarkInvoicePaidSchema,
  AdminCancelInvoiceDTO,
  AdminCancelInvoiceSchema,
  AdminCreateSubscriptionDTO,
  AdminCreateSubscriptionSchema,
  AdminGenerateInvoiceDTO,
  AdminGenerateInvoiceSchema,
} from './dto.update';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller(':lang/admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Scopes('admin')
@SkipSubscriptionCheck()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== DASHBOARD ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard stats retrieved successfully' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getDashboardStats() {
    return await this.adminService.getDashboardStats();
  }

  // ==================== USERS ====================

  @Get('users')
  @ApiOperation({ summary: 'Get all users with filters' })
  @ApiResponse({ status: 200, description: 'Users list retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema },
    query: AdminQueryUsersSchema,
  }))
  async getUsers(@Query() query: AdminQueryUsersDTO) {
    return await this.adminService.getUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details with stores' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
  }))
  async getUserById(@Param('id') id: string) {
    return await this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user (role, status)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
    body: AdminUpdateUserSchema,
  }))
  async updateUser(
    @Param('id') id: string,
    @Body() data: AdminUpdateUserDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.updateUser(id, data, admin._id.toString());
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete user (soft delete)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
  }))
  async deleteUser(@Param('id') id: string, @User() admin: UserDocument) {
    return await this.adminService.deleteUser(id, admin._id.toString());
  }

  // ==================== STORES ====================

  @Get('stores')
  @ApiOperation({ summary: 'Get all stores with filters' })
  @ApiResponse({ status: 200, description: 'Stores list retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema },
    query: AdminQueryStoresSchema,
  }))
  async getStores(@Query() query: AdminQueryStoresDTO) {
    return await this.adminService.getStores(query);
  }

  @Get('stores/:id')
  @ApiOperation({ summary: 'Get store details with members and billing' })
  @ApiResponse({ status: 200, description: 'Store details retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
  }))
  async getStoreById(@Param('id') id: string) {
    return await this.adminService.getStoreById(id);
  }

  @Patch('stores/:id/suspend')
  @ApiOperation({ summary: 'Suspend a store' })
  @ApiResponse({ status: 200, description: 'Store suspended successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
    body: AdminSuspendStoreSchema,
  }))
  async suspendStore(
    @Param('id') id: string,
    @Body() data: AdminSuspendStoreDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.suspendStore(id, data, admin._id.toString());
  }

  @Patch('stores/:id/unsuspend')
  @ApiOperation({ summary: 'Unsuspend a store' })
  @ApiResponse({ status: 200, description: 'Store unsuspended successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
  }))
  async unsuspendStore(@Param('id') id: string, @User() admin: UserDocument) {
    return await this.adminService.unsuspendStore(id, admin._id.toString());
  }

  @Delete('stores/:id')
  @ApiOperation({ summary: 'Delete store (soft delete)' })
  @ApiResponse({ status: 200, description: 'Store deleted successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
  }))
  async deleteStore(@Param('id') id: string, @User() admin: UserDocument) {
    return await this.adminService.deleteStore(id, admin._id.toString());
  }

  // ==================== SUBSCRIPTIONS ====================

  @Get('subscriptions')
  @ApiOperation({ summary: 'Get all subscriptions' })
  @ApiResponse({ status: 200, description: 'Subscriptions list retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema },
    query: AdminQuerySubscriptionsSchema,
  }))
  async getSubscriptions(@Query() query: AdminQuerySubscriptionsDTO) {
    return await this.adminService.getSubscriptions(query);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({ summary: 'Update subscription (status, trial)' })
  @ApiResponse({ status: 200, description: 'Subscription updated successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
    body: AdminUpdateSubscriptionSchema,
  }))
  async updateSubscription(
    @Param('id') id: string,
    @Body() data: AdminUpdateSubscriptionDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.updateSubscription(id, data, admin._id.toString());
  }

  @Post('subscriptions/:storeId/cancel')
  @ApiOperation({ summary: 'Cancel store subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, storeId: MongoIdSchema },
    body: AdminCancelSubscriptionSchema,
  }))
  async cancelSubscription(
    @Param('storeId') storeId: string,
    @Body() data: AdminCancelSubscriptionDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.cancelSubscription(storeId, data, admin._id.toString());
  }

  @Post('subscriptions/:storeId/reactivate')
  @ApiOperation({ summary: 'Reactivate store subscription' })
  @ApiResponse({ status: 200, description: 'Subscription reactivated successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, storeId: MongoIdSchema },
  }))
  async reactivateSubscription(
    @Param('storeId') storeId: string,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.reactivateSubscription(storeId, admin._id.toString());
  }

  @Post('subscriptions/:storeId/create')
  @ApiOperation({ summary: 'Create subscription for store without one' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, storeId: MongoIdSchema },
    body: AdminCreateSubscriptionSchema,
  }))
  async createSubscription(
    @Param('storeId') storeId: string,
    @Body() data: AdminCreateSubscriptionDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.createSubscriptionForStore(storeId, data, admin._id.toString());
  }

  // ==================== INVOICES ====================

  @Get('invoices')
  @ApiOperation({ summary: 'Get all invoices with filters' })
  @ApiResponse({ status: 200, description: 'Invoices list retrieved successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema },
    query: AdminQueryInvoicesSchema,
  }))
  async getInvoices(@Query() query: AdminQueryInvoicesDTO) {
    return await this.adminService.getInvoices(query);
  }

  @Get('invoices/stats')
  @ApiOperation({ summary: 'Get invoice statistics' })
  @ApiResponse({ status: 200, description: 'Invoice stats retrieved successfully' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getInvoiceStats() {
    return await this.adminService.getInvoiceStats();
  }

  @Patch('invoices/:id/mark-paid')
  @ApiOperation({ summary: 'Mark invoice as paid (manual)' })
  @ApiResponse({ status: 200, description: 'Invoice marked as paid successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
    body: AdminMarkInvoicePaidSchema,
  }))
  async markInvoicePaid(
    @Param('id') id: string,
    @Body() data: AdminMarkInvoicePaidDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.markInvoicePaid(id, data, admin._id.toString());
  }

  @Patch('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel an invoice' })
  @ApiResponse({ status: 200, description: 'Invoice cancelled successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, id: MongoIdSchema },
    body: AdminCancelInvoiceSchema,
  }))
  async cancelInvoice(
    @Param('id') id: string,
    @Body() data: AdminCancelInvoiceDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.cancelInvoice(id, data, admin._id.toString());
  }

  @Post('invoices/:storeId/generate')
  @ApiOperation({ summary: 'Generate invoice for a store' })
  @ApiResponse({ status: 201, description: 'Invoice generated successfully' })
  @UsePipes(new JoiValidationPipe({
    param: { lang: LanguageSchema, storeId: MongoIdSchema },
    body: AdminGenerateInvoiceSchema,
  }))
  async generateInvoice(
    @Param('storeId') storeId: string,
    @Body() data: AdminGenerateInvoiceDTO,
    @User() admin: UserDocument,
  ) {
    return await this.adminService.generateInvoice(storeId, data, admin._id.toString());
  }
}
