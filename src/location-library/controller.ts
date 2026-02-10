import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UsePipes,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { LanguageSchema } from '../dtos/lang.dto';
import { Multer } from 'multer';
import { LocationLibraryService } from './service';
import {
  CreateStateGroupDto,
  CreateStateGroupSchema,
  UpdateStateGroupDto,
  UpdateStateGroupSchema,
  CreateLocalStateDto,
  CreateLocalStateSchema,
  UpdateLocalStateDto,
  UpdateLocalStateSchema,
  BulkCreateLocalStatesDto,
  BulkCreateLocalStatesSchema,
  SyncToStoreDto,
  SyncToStoreSchema,
} from './dto';

@ApiTags('Location Library')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller(':lang/location-library')
export class LocationLibraryController {
  constructor(
    private readonly locationLibraryService: LocationLibraryService,
  ) {}

  // ============== COUNTRIES SUMMARY ==============

  @Get('countries')
  @ApiOperation({ summary: 'Get summary of countries with states in library' })
  @ApiResponse({ status: 200, description: 'Countries summary retrieved' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getCountriesSummary(@User() user: UserDocument) {
    return this.locationLibraryService.getCountriesSummary(user._id.toString());
  }

  // ============== STATE GROUPS ==============

  @Get('groups')
  @ApiOperation({ summary: 'Get all state groups' })
  @ApiResponse({ status: 200, description: 'Groups retrieved' })
  @ApiQuery({ name: 'countryCode', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getGroups(
    @User() user: UserDocument,
    @Query('countryCode') countryCode?: string,
  ) {
    return this.locationLibraryService.getGroups(
      user._id.toString(),
      countryCode,
    );
  }

  @Get('groups/:groupId')
  @ApiOperation({ summary: 'Get a single state group' })
  @ApiResponse({ status: 200, description: 'Group retrieved' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getGroup(
    @User() user: UserDocument,
    @Param('groupId') groupId: string,
  ) {
    return this.locationLibraryService.getGroup(user._id.toString(), groupId);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Create a state group' })
  @ApiResponse({ status: 201, description: 'Group created' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateStateGroupSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createGroup(
    @User() user: UserDocument,
    @Body() dto: CreateStateGroupDto,
  ) {
    return this.locationLibraryService.createGroup(user._id.toString(), dto);
  }

  @Put('groups/:groupId')
  @ApiOperation({ summary: 'Update a state group' })
  @ApiResponse({ status: 200, description: 'Group updated' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateStateGroupSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateGroup(
    @User() user: UserDocument,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateStateGroupDto,
  ) {
    return this.locationLibraryService.updateGroup(
      user._id.toString(),
      groupId,
      dto,
    );
  }

  @Delete('groups/:groupId')
  @ApiOperation({ summary: 'Delete a state group' })
  @ApiResponse({ status: 200, description: 'Group deleted' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async deleteGroup(
    @User() user: UserDocument,
    @Param('groupId') groupId: string,
  ) {
    await this.locationLibraryService.deleteGroup(user._id.toString(), groupId);
    return { success: true, message: 'Group deleted' };
  }

  // ============== LOCAL STATES ==============

  @Get('states')
  @ApiOperation({ summary: 'Get all local states' })
  @ApiResponse({ status: 200, description: 'States retrieved' })
  @ApiQuery({ name: 'countryCode', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getStates(
    @User() user: UserDocument,
    @Query('countryCode') countryCode?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.locationLibraryService.getStates(
      user._id.toString(),
      countryCode,
      groupId,
    );
  }

  // ============== CSV EXPORT/IMPORT ==============

  @Get('states/export')
  @ApiOperation({ summary: 'Export states to CSV' })
  @ApiResponse({ status: 200, description: 'Returns CSV file' })
  @ApiQuery({ name: 'countryCode', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async exportCsv(
    @User() user: UserDocument,
    @Query('countryCode') countryCode: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!countryCode) {
      throw new BadRequestException('Country code is required');
    }
    const csv = await this.locationLibraryService.exportStatesToCsv(
      user._id.toString(),
      countryCode,
    );
    const filename = `states-${countryCode.toUpperCase()}-export-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(csv);
  }

  @Post('states/import')
  @ApiOperation({ summary: 'Import states from CSV' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiResponse({ status: 201, description: 'States imported successfully' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'countryCode', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importFromCsv(
    @UploadedFile() file: Multer.File,
    @Query('countryCode') countryCode: string,
    @User() user: UserDocument,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!countryCode) {
      throw new BadRequestException('Country code is required');
    }

    return await this.locationLibraryService.importStatesFromCsv(
      user._id.toString(),
      countryCode,
      file.buffer.toString('utf-8'),
    );
  }

  @Get('states/import/template')
  @ApiOperation({ summary: 'Download CSV import template for states' })
  @ApiParam({ name: 'lang', enum: ['en', 'ar'] })
  @ApiResponse({ status: 200, description: 'Returns CSV template file' })
  async getImportTemplate(@Res() res: Response) {
    const headers = [
      'Country Code',
      'State Code',
      'State Name',
      'Original Name',
      'Groups',
      'Type',
      'Order',
      'Notes',
    ];

    const exampleRow = [
      'EG',
      'EGALX',
      'Alexandria',
      'Alexandria',
      'Delta Region; Northern Egypt',
      'Override',
      '1',
      'Main port city',
    ];

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), exampleRow.join(',')].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="states-import-template.csv"',
    );
    res.send(csv);
  }

  @Get('states/:stateId')
  @ApiOperation({ summary: 'Get a single local state' })
  @ApiResponse({ status: 200, description: 'State retrieved' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async getState(
    @User() user: UserDocument,
    @Param('stateId') stateId: string,
  ) {
    return this.locationLibraryService.getState(user._id.toString(), stateId);
  }

  @Post('states')
  @ApiOperation({ summary: 'Create a local state' })
  @ApiResponse({ status: 201, description: 'State created' })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateLocalStateSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async createState(
    @User() user: UserDocument,
    @Body() dto: CreateLocalStateDto,
  ) {
    return this.locationLibraryService.createState(user._id.toString(), dto);
  }

  @Put('states/:stateId')
  @ApiOperation({ summary: 'Update a local state' })
  @ApiResponse({ status: 200, description: 'State updated' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateLocalStateSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async updateState(
    @User() user: UserDocument,
    @Param('stateId') stateId: string,
    @Body() dto: UpdateLocalStateDto,
  ) {
    return this.locationLibraryService.updateState(
      user._id.toString(),
      stateId,
      dto,
    );
  }

  @Put('states/:stateId/toggle-enabled')
  @ApiOperation({
    summary: 'Toggle state enabled/disabled and sync to WooCommerce',
  })
  @ApiResponse({ status: 200, description: 'State toggled' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async toggleStateEnabled(
    @User() user: UserDocument,
    @Param('stateId') stateId: string,
    @Query('storeId') storeId: string,
    @Body() body: { enabled: boolean },
  ) {
    if (!storeId) {
      throw new BadRequestException('storeId is required');
    }
    return this.locationLibraryService.toggleStateEnabled(
      user._id.toString(),
      stateId,
      body.enabled,
      storeId,
    );
  }

  @Delete('states/:stateId')
  @ApiOperation({ summary: 'Delete a local state' })
  @ApiResponse({ status: 200, description: 'State deleted' })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async deleteState(
    @User() user: UserDocument,
    @Param('stateId') stateId: string,
  ) {
    await this.locationLibraryService.deleteState(user._id.toString(), stateId);
    return { success: true, message: 'State deleted' };
  }

  @Post('states/bulk')
  @ApiOperation({ summary: 'Bulk create/update local states' })
  @ApiResponse({ status: 201, description: 'States created/updated' })
  @UsePipes(
    new JoiValidationPipe({
      body: BulkCreateLocalStatesSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async bulkCreateStates(
    @User() user: UserDocument,
    @Body() dto: BulkCreateLocalStatesDto,
  ) {
    return this.locationLibraryService.bulkCreateStates(
      user._id.toString(),
      dto,
    );
  }

  // ============== SYNC OPERATIONS ==============

  @Post('sync-to-store')
  @ApiOperation({ summary: 'Sync local states to a store' })
  @ApiResponse({ status: 200, description: 'States synced to store' })
  @UsePipes(
    new JoiValidationPipe({
      body: SyncToStoreSchema,
      param: { lang: LanguageSchema },
    }),
  )
  async syncToStore(@User() user: UserDocument, @Body() dto: SyncToStoreDto) {
    return this.locationLibraryService.syncToStore(
      user._id.toString(),
      dto.storeId,
      dto.countryCode,
      dto.stateIds,
    );
  }

  @Post('import-from-store')
  @ApiOperation({ summary: 'Import states from a store to library' })
  @ApiResponse({ status: 200, description: 'States imported from store' })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'countryCode', required: true })
  @UsePipes(new JoiValidationPipe({ param: { lang: LanguageSchema } }))
  async importFromStore(
    @User() user: UserDocument,
    @Query('storeId') storeId: string,
    @Query('countryCode') countryCode: string,
  ) {
    return this.locationLibraryService.importFromWooCommerce(
      user._id.toString(),
      storeId,
      countryCode,
    );
  }
}
