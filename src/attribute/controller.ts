import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AttributeService } from './service';
import { JoiValidationPipe } from '../pipes/joi-validator.pipe';
import { User } from '../decorators/user.decorator';
import { UserDocument } from '../schema/user.schema';
import { LanguageSchema } from '../dtos/lang.dto';

@ApiTags('Attribute')
@ApiBearerAuth()
@Controller(':lang/attribute')
@UseGuards(AuthGuard('jwt'))
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  @Post('sync/:storeId')
  @ApiOperation({ summary: 'Sync attributes from WooCommerce' })
  @ApiResponse({ status: 200, description: 'Attributes synced successfully' })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async syncAttributes(
    @Param('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    const result = await this.attributeService.syncFromWooCommerce(user._id.toString(), storeId);
    return {
      message: 'Attributes synced successfully',
      ...result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all attributes for a store' })
  @ApiResponse({ status: 200, description: 'Attributes retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @ApiQuery({ name: 'includeTerms', required: false, type: Boolean })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAttributes(
    @Query('storeId') storeId: string,
    @Query('includeTerms') includeTerms: string,
    @User() user: UserDocument,
  ) {
    if (includeTerms === 'true') {
      return await this.attributeService.getAttributesWithTerms(user._id.toString(), storeId);
    }
    return await this.attributeService.getAttributes(user._id.toString(), storeId);
  }

  @Get(':attributeId')
  @ApiOperation({ summary: 'Get a single attribute with terms' })
  @ApiResponse({ status: 200, description: 'Attribute retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getAttribute(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.attributeService.getAttribute(
      user._id.toString(),
      storeId,
      attributeId,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create an attribute' })
  @ApiResponse({ status: 201, description: 'Attribute created successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async createAttribute(
    @Query('storeId') storeId: string,
    @Body() body: { name: string; slug?: string; type?: string; orderBy?: string; hasArchives?: boolean },
    @User() user: UserDocument,
  ) {
    return await this.attributeService.createAttribute(user._id.toString(), storeId, body);
  }

  @Patch(':attributeId')
  @ApiOperation({ summary: 'Update an attribute' })
  @ApiResponse({ status: 200, description: 'Attribute updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async updateAttribute(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @Body() body: { name?: string; slug?: string; type?: string; orderBy?: string; hasArchives?: boolean },
    @User() user: UserDocument,
  ) {
    return await this.attributeService.updateAttribute(
      user._id.toString(),
      storeId,
      attributeId,
      body,
    );
  }

  @Delete(':attributeId')
  @ApiOperation({ summary: 'Delete an attribute' })
  @ApiResponse({ status: 200, description: 'Attribute deleted successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteAttribute(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    await this.attributeService.deleteAttribute(
      user._id.toString(),
      storeId,
      attributeId,
    );
    return { message: 'Attribute deleted successfully' };
  }

  // ==================== TERMS ====================

  @Get(':attributeId/terms')
  @ApiOperation({ summary: 'Get all terms for an attribute' })
  @ApiResponse({ status: 200, description: 'Terms retrieved successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async getTerms(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    return await this.attributeService.getTerms(
      user._id.toString(),
      storeId,
      attributeId,
    );
  }

  @Post(':attributeId/terms')
  @ApiOperation({ summary: 'Create a term' })
  @ApiResponse({ status: 201, description: 'Term created successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async createTerm(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @Body() body: { name: string; slug?: string; description?: string; menuOrder?: number },
    @User() user: UserDocument,
  ) {
    return await this.attributeService.createTerm(
      user._id.toString(),
      storeId,
      attributeId,
      body,
    );
  }

  @Patch(':attributeId/terms/:termId')
  @ApiOperation({ summary: 'Update a term' })
  @ApiResponse({ status: 200, description: 'Term updated successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async updateTerm(
    @Param('attributeId') attributeId: string,
    @Param('termId') termId: string,
    @Query('storeId') storeId: string,
    @Body() body: { name?: string; slug?: string; description?: string; menuOrder?: number },
    @User() user: UserDocument,
  ) {
    return await this.attributeService.updateTerm(
      user._id.toString(),
      storeId,
      attributeId,
      termId,
      body,
    );
  }

  @Delete(':attributeId/terms/:termId')
  @ApiOperation({ summary: 'Delete a term' })
  @ApiResponse({ status: 200, description: 'Term deleted successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async deleteTerm(
    @Param('attributeId') attributeId: string,
    @Param('termId') termId: string,
    @Query('storeId') storeId: string,
    @User() user: UserDocument,
  ) {
    await this.attributeService.deleteTerm(
      user._id.toString(),
      storeId,
      attributeId,
      termId,
    );
    return { message: 'Term deleted successfully' };
  }

  @Post(':attributeId/terms/reorder')
  @ApiOperation({ summary: 'Reorder terms' })
  @ApiResponse({ status: 200, description: 'Terms reordered successfully' })
  @ApiQuery({ name: 'storeId', required: true })
  @UsePipes(
    new JoiValidationPipe({
      param: { lang: LanguageSchema },
    }),
  )
  async reorderTerms(
    @Param('attributeId') attributeId: string,
    @Query('storeId') storeId: string,
    @Body() body: { termIds: string[] },
    @User() user: UserDocument,
  ) {
    await this.attributeService.reorderTerms(
      user._id.toString(),
      storeId,
      attributeId,
      body.termIds,
    );
    return { message: 'Terms reordered successfully' };
  }
}
