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
  Request,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProductionBatchesService } from './service';
import { JoiValidationPipe } from '../pipes';
import {
  CreateProductionBatchDto,
  CreateProductionBatchSchema,
  UpdateProductionBatchDto,
  UpdateProductionBatchSchema,
  StartProductionDto,
  StartProductionSchema,
  CompleteProductionDto,
  CompleteProductionSchema,
  CancelProductionDto,
  CancelProductionSchema,
  QueryProductionBatchDto,
  QueryProductionBatchSchema,
} from './dto';

@ApiTags('Production Batches')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/production/batches')
export class ProductionBatchesController {
  constructor(private readonly batchesService: ProductionBatchesService) {}

  // Static routes MUST come before parameterized routes (:id)

  @Get('stats')
  @ApiOperation({ summary: 'Get production statistics' })
  @ApiResponse({ status: 200, description: 'Production statistics' })
  @UsePipes(new JoiValidationPipe({ query: QueryProductionBatchSchema }))
  async getStats(@Request() req, @Query() query: QueryProductionBatchDto) {
    return this.batchesService.getStats(req.user._id.toString(), query.storeId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all production batches' })
  @ApiResponse({ status: 200, description: 'List of production batches' })
  @UsePipes(new JoiValidationPipe({ query: QueryProductionBatchSchema }))
  async findAll(@Request() req, @Query() query: QueryProductionBatchDto) {
    return this.batchesService.findByStore(req.user._id.toString(), query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new production batch' })
  @ApiResponse({ status: 201, description: 'Production batch created' })
  @UsePipes(new JoiValidationPipe({ body: CreateProductionBatchSchema }))
  async create(
    @Request() req,
    @Query('storeId') storeId: string,
    @Body() dto: CreateProductionBatchDto,
  ) {
    return this.batchesService.create(storeId, req.user._id.toString(), dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get production batch by ID' })
  @ApiResponse({ status: 200, description: 'Production batch details' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.batchesService.findById(req.user._id.toString(), id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a production batch' })
  @ApiResponse({ status: 200, description: 'Production batch updated' })
  @UsePipes(new JoiValidationPipe({ body: UpdateProductionBatchSchema }))
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateProductionBatchDto,
  ) {
    return this.batchesService.update(req.user._id.toString(), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a production batch' })
  @ApiResponse({ status: 200, description: 'Production batch deleted' })
  async delete(@Request() req, @Param('id') id: string) {
    await this.batchesService.delete(req.user._id.toString(), id);
    return { message: 'Production batch deleted successfully' };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start production' })
  @ApiResponse({ status: 200, description: 'Production started' })
  @UsePipes(new JoiValidationPipe({ body: StartProductionSchema }))
  async startProduction(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: StartProductionDto,
  ) {
    return this.batchesService.startProduction(req.user._id.toString(), id, dto);
  }

  @Post(':id/qc')
  @ApiOperation({ summary: 'Send to QC' })
  @ApiResponse({ status: 200, description: 'Batch sent to QC' })
  async sendToQC(@Request() req, @Param('id') id: string) {
    return this.batchesService.sendToQC(req.user._id.toString(), id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete production' })
  @ApiResponse({ status: 200, description: 'Production completed' })
  @UsePipes(new JoiValidationPipe({ body: CompleteProductionSchema }))
  async completeProduction(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CompleteProductionDto,
  ) {
    return this.batchesService.completeProduction(req.user._id.toString(), id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel production' })
  @ApiResponse({ status: 200, description: 'Production cancelled' })
  @UsePipes(new JoiValidationPipe({ body: CancelProductionSchema }))
  async cancelProduction(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CancelProductionDto,
  ) {
    return this.batchesService.cancelProduction(req.user._id.toString(), id, dto);
  }

  @Get(':id/cost')
  @ApiOperation({ summary: 'Get cost summary for a batch' })
  @ApiResponse({ status: 200, description: 'Cost summary' })
  async getCostSummary(@Request() req, @Param('id') id: string) {
    return this.batchesService.getCostSummary(req.user._id.toString(), id);
  }
}
