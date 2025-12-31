import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JoiValidationPipe } from '../pipes';
import { User } from '../decorators';
import { LanguageSchema } from '../dtos/lang.dto';
import { OrderFulfillmentService } from './service';
import {
  AssignUnitsDto,
  AssignUnitsSchema,
  ScanRfidDto,
  ScanRfidSchema,
  CompleteFulfillmentDto,
  CompleteFulfillmentSchema,
  BulkAssignDto,
  BulkAssignSchema,
} from './dto';

@ApiTags('Order Fulfillment')
@ApiBearerAuth()
@Controller(':lang/order-fulfillment')
@UseGuards(AuthGuard('jwt'))
export class OrderFulfillmentController {
  constructor(private readonly fulfillmentService: OrderFulfillmentService) {}

  @Get(':orderId/status')
  @ApiOperation({ summary: 'Get fulfillment status and suggestions for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getFulfillmentStatus(@Param('orderId') orderId: string) {
    return this.fulfillmentService.getFulfillmentStatus(orderId);
  }

  @Post(':orderId/assign')
  @ApiOperation({ summary: 'Assign units to a line item' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: AssignUnitsDto })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema }, body: AssignUnitsSchema }))
  async assignUnits(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AssignUnitsDto,
  ) {
    return this.fulfillmentService.assignUnits(userId, orderId, dto.lineItemIndex, dto.unitIds);
  }

  @Post(':orderId/bulk-assign')
  @ApiOperation({ summary: 'Bulk assign units to multiple line items' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: BulkAssignDto })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema }, body: BulkAssignSchema }))
  async bulkAssign(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: BulkAssignDto,
  ) {
    for (const assignment of dto.assignments) {
      await this.fulfillmentService.assignUnits(
        userId,
        orderId,
        assignment.lineItemIndex,
        assignment.unitIds,
      );
    }
    return this.fulfillmentService.getFulfillmentStatus(orderId);
  }

  @Post(':orderId/scan')
  @ApiOperation({ summary: 'Scan RFID and auto-assign to matching line item' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: ScanRfidDto })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema }, body: ScanRfidSchema }))
  async scanRfid(
    @Param('orderId') orderId: string,
    @Body() dto: ScanRfidDto,
  ) {
    return this.fulfillmentService.scanRfid(orderId, dto.rfidCode);
  }

  @Delete(':orderId/unit/:unitId')
  @ApiOperation({ summary: 'Remove a unit from fulfillment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiParam({ name: 'unitId', description: 'Unit ID to remove' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async removeUnit(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.fulfillmentService.removeUnit(userId, orderId, unitId);
  }

  @Post(':orderId/auto-assign')
  @ApiOperation({ summary: 'Auto-assign all suggested units (FIFO)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async autoAssign(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.fulfillmentService.autoAssignAll(userId, orderId);
  }

  @Post(':orderId/complete')
  @ApiOperation({ summary: 'Complete fulfillment - mark all assigned units as sold' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({ type: CompleteFulfillmentDto })
  @UsePipes(
    new JoiValidationPipe({ param: { lang: LanguageSchema }, body: CompleteFulfillmentSchema }),
  )
  async completeFulfillment(
    @User('_id') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CompleteFulfillmentDto,
  ) {
    return this.fulfillmentService.completeFulfillment(userId, orderId, dto.notes);
  }
}
