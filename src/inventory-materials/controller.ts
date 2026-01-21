import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { InventoryMaterialsService } from './service';
import {
  CreateMaterialDto,
  CreateMaterialSchema,
  UpdateMaterialDto,
  UpdateMaterialSchema,
  QueryMaterialDto,
  QueryMaterialSchema,
  AddStockDto,
  AddStockSchema,
  AdjustStockDto,
  AdjustStockSchema,
  QueryTransactionsDto,
  QueryTransactionsSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';

@ApiTags('Inventory Materials')
@ApiBearerAuth()
@Controller(':lang/inventory/materials')
@UseGuards(AuthGuard('jwt'))
export class InventoryMaterialsController {
  constructor(private readonly materialsService: InventoryMaterialsService) {}

  // Static routes MUST come before parameterized routes (:id)

  @Get()
  @ApiOperation({ summary: 'Get all materials for a store' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search keyword' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'size', required: false, description: 'Page size' })
  @UsePipes(new JoiValidationPipe({ query: QueryMaterialSchema }))
  async findAll(@User('_id') userId: string, @Query() query: QueryMaterialDto) {
    return this.materialsService.findByStore(userId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new material' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @UsePipes(new JoiValidationPipe({ body: CreateMaterialSchema }))
  async create(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateMaterialDto,
  ) {
    return this.materialsService.create(userId, storeId, dto);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get materials with low stock' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  async getLowStock(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.materialsService.getLowStock(userId, storeId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get unique material categories' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  async getCategories(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.materialsService.getCategories(userId, storeId);
  }

  // Parameterized routes come after static routes

  @Get(':id')
  @ApiOperation({ summary: 'Get material by ID' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.materialsService.findById(userId, id);
  }

  @Get(':id/transactions')
  @ApiOperation({ summary: 'Get transaction history for a material' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @UsePipes(new JoiValidationPipe({ query: QueryTransactionsSchema }))
  async getTransactions(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.materialsService.getTransactions(userId, id, query);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a material' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateMaterialSchema }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
  ) {
    return this.materialsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a material' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  async delete(@User('_id') userId: string, @Param('id') id: string) {
    await this.materialsService.delete(userId, id);
    return { success: true, message: 'Material deleted successfully' };
  }

  @Post(':id/stock/add')
  @ApiOperation({ summary: 'Add stock to a material (purchase)' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @UsePipes(new JoiValidationPipe({ body: AddStockSchema }))
  async addStock(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddStockDto,
  ) {
    return this.materialsService.addStock(userId, id, dto);
  }

  @Post(':id/stock/adjust')
  @ApiOperation({ summary: 'Adjust stock (correction or waste)' })
  @ApiParam({ name: 'id', description: 'Material ID' })
  @UsePipes(new JoiValidationPipe({ body: AdjustStockSchema }))
  async adjustStock(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.materialsService.adjustStock(userId, id, dto);
  }
}
