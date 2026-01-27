import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { InventoryService } from './service';
import { InventoryChangeType, AlertType, AlertStatus } from './enum';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller(':lang/inventory')
@UseGuards(AuthGuard())
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get inventory overview' })
  @ApiResponse({ status: 200, description: 'Overview retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getOverview(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.getOverview(
      user._id.toString(),
      storeId,
    );
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get stock alerts' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: AlertStatus })
  @ApiQuery({ name: 'alertType', required: false, enum: AlertType })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAlerts(
    @Query('storeId') storeId: string,
    @Query('status') status: AlertStatus,
    @Query('alertType') alertType: AlertType,
    @Query('page') page = 1,
    @Query('size') size = 20,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.getAlerts(user._id.toString(), {
      storeId,
      status,
      alertType,
      page: Number(page),
      size: Number(size),
    });
  }

  @Get('alerts/count')
  @ApiOperation({ summary: 'Get alert counts for dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Alert counts retrieved successfully',
  })
  @ApiQuery({ name: 'storeId', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAlertCount(
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.getAlertCount(
      user._id.toString(),
      storeId,
    );
  }

  @Post('alerts/:alertId/dismiss')
  @ApiOperation({ summary: 'Dismiss a stock alert' })
  @ApiResponse({ status: 200, description: 'Alert dismissed successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async dismissAlert(
    @Param('alertId') alertId: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.dismissAlert(
      alertId,
      user._id.toString(),
    );
  }

  @Get('logs/export')
  @ApiOperation({ summary: 'Export inventory change logs to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'changeType', required: false, enum: InventoryChangeType })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async exportLogs(
    @Query('productId') productId: string,
    @Query('storeId') storeId: string,
    @Query('changeType') changeType: InventoryChangeType,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @User() user: UserDocument,
    @Param('lang') lang: string,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.inventoryService.exportToCsv(
      user._id.toString(),
      {
        productId,
        storeId,
        changeType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    );
    const filename = `inventory-logs-export-${
      new Date().toISOString().split('T')[0]
    }.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,
    );
    res.send(csv);
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get inventory change logs' })
  @ApiResponse({ status: 200, description: 'Logs retrieved successfully' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'storeId', required: false })
  @ApiQuery({ name: 'changeType', required: false, enum: InventoryChangeType })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getLogs(
    @Query('productId') productId: string,
    @Query('storeId') storeId: string,
    @Query('changeType') changeType: InventoryChangeType,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page = 1,
    @Query('size') size = 20,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.getLogs(user._id.toString(), {
      productId,
      storeId,
      changeType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: Number(page),
      size: Number(size),
    });
  }

  @Get('product/:productId/logs')
  @ApiOperation({ summary: 'Get inventory logs for a specific product' })
  @ApiResponse({ status: 200, description: 'Logs retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getProductLogs(
    @Param('productId') productId: string,
    @Query('page') page = 1,
    @Query('size') size = 20,
    @User() user: UserDocument,
    @Param('lang') lang: string,
  ) {
    return await this.inventoryService.getLogs(user._id.toString(), {
      productId,
      page: Number(page),
      size: Number(size),
    });
  }
}
