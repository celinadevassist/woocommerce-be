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
import { InventorySKUsService } from './service';
import {
  CreateSKUDto,
  CreateSKUSchema,
  UpdateSKUDto,
  UpdateSKUSchema,
  QuerySKUDto,
  QuerySKUSchema,
} from './dto';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';

@ApiTags('Inventory SKUs')
@ApiBearerAuth()
@Controller(':lang/inventory/skus')
@UseGuards(AuthGuard('jwt'))
export class InventorySKUsController {
  constructor(private readonly skusService: InventorySKUsService) {}

  // Static routes MUST come before parameterized routes (:id)

  @Get()
  @ApiOperation({ summary: 'Get all SKUs for a store' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({ name: 'keyword', required: false, description: 'Search keyword' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'size', required: false, description: 'Page size' })
  @UsePipes(new JoiValidationPipe({ query: QuerySKUSchema }))
  async findAll(@User('_id') userId: string, @Query() query: QuerySKUDto) {
    return this.skusService.findByStore(userId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new SKU' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  @UsePipes(new JoiValidationPipe({ body: CreateSKUSchema }))
  async create(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
    @Body() dto: CreateSKUDto,
  ) {
    return this.skusService.create(userId, storeId, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get unique SKU categories' })
  @ApiQuery({ name: 'storeId', required: true, description: 'Store ID' })
  async getCategories(
    @User('_id') userId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.skusService.getCategories(userId, storeId);
  }

  // Parameterized routes come after static routes

  @Get(':id')
  @ApiOperation({ summary: 'Get SKU by ID' })
  @ApiParam({ name: 'id', description: 'SKU ID' })
  async findById(@User('_id') userId: string, @Param('id') id: string) {
    return this.skusService.findById(userId, id);
  }

  @Get(':id/cost')
  @ApiOperation({ summary: 'Get cost breakdown for a SKU' })
  @ApiParam({ name: 'id', description: 'SKU ID' })
  async getCostBreakdown(@User('_id') userId: string, @Param('id') id: string) {
    return this.skusService.getCostBreakdown(userId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a SKU' })
  @ApiParam({ name: 'id', description: 'SKU ID' })
  @UsePipes(new JoiValidationPipe({ body: UpdateSKUSchema }))
  async update(
    @User('_id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSKUDto,
  ) {
    return this.skusService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a SKU' })
  @ApiParam({ name: 'id', description: 'SKU ID' })
  async delete(@User('_id') userId: string, @Param('id') id: string) {
    await this.skusService.delete(userId, id);
    return { success: true, message: 'SKU deleted successfully' };
  }

  @Post(':id/recalculate-cost')
  @ApiOperation({ summary: 'Recalculate and save cost for a SKU' })
  @ApiParam({ name: 'id', description: 'SKU ID' })
  async recalculateCost(@User('_id') userId: string, @Param('id') id: string) {
    return this.skusService.recalculateCost(userId, id);
  }
}
