import { Controller, Get, UsePipes, UseGuards, Query, Body, Patch, Param, Post, Delete, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';

import { Response } from 'express';

import { Scopes, User } from '../decorators';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../guards';
import { JoiValidationPipe } from '../pipes';

import { MetadataService } from './service';
import { LanguageSchema, MongoIdSchema } from 'src/dtos';
import { CreateMetadataDto, CreateMetadataSchema } from './dto.create';
import { IMetadata } from './interface';
import { UpdateMetadataDto, UpdateMetadataSchema } from './dto.update';
import { QueryMetadataDto, QueryMetadataSchema } from './dto.query';
import { UserDocument } from 'src/schema';

@ApiTags('Common - Metadata')
@ApiBearerAuth()
@Controller(':lang/metadata')
export class MetadataController {
    constructor(
        private readonly metadataService: MetadataService,
    ) { }

    @Post()
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        body: CreateMetadataSchema,
        param: {
            lang: LanguageSchema,
        },
    }))
    async create(@Body() data: CreateMetadataDto, @User() creator: UserDocument, @Param('lang') lang: string): Promise<IMetadata> {
        return await this.metadataService.createOrUpdate(creator, data, lang);
    }

    @Get()
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        query: QueryMetadataSchema,
        param: {
            lang: LanguageSchema,
        },
    }))
    async get(@Query() filters: QueryMetadataDto, @User() user: UserDocument, @Param('lang') lang: string) {
        return await this.metadataService.get(filters, lang);
    }

    @Get('all')
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        query: QueryMetadataSchema,
        param: {
            lang: LanguageSchema,
        },
    }))
    async getAll(@Query() query: QueryMetadataDto, @User() user: UserDocument, @Param('lang') lang: string) {
        return await this.metadataService.getAll(query, user);
    }

    @Get(':id')
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        param: {
            id: MongoIdSchema,
            lang: LanguageSchema,
        }
    }))
    async findById(@Param('id') id: string, @User() user: UserDocument, @Param('lang') lang: string): Promise<IMetadata> {
        return await this.metadataService.findById(id, user);
    }

    @Get('user/:userId/module/:forModule')
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        param: {
            userId: MongoIdSchema,
            forModule: LanguageSchema,
            lang: LanguageSchema,
        }
    }))
    @ApiParam({ name: 'userId', required: true, description: 'User ID' })
    @ApiParam({ name: 'forModule', required: true, description: 'Module name' })
    async findByUserAndModule(
        @Param('userId') userId: string, 
        @Param('forModule') forModule: string,
        @User() user: UserDocument, 
        @Param('lang') lang: string
    ): Promise<IMetadata | null> {
        return await this.metadataService.findByUserAndModule(userId, forModule);
    }

    @Patch(':id')
    @UseGuards(AuthGuard())
    @UsePipes(new JoiValidationPipe({
        body: UpdateMetadataSchema,
        param: {
            id: MongoIdSchema,
            lang: LanguageSchema,
        }
    }))
    async update(@Param('id') id: string, @Body() body: UpdateMetadataDto, @User() user: UserDocument, @Param('lang') lang: string): Promise<IMetadata> {
        return await this.metadataService.update(id, user, body, lang);
    }
    
    // Commented out delete endpoint as per requirements
    // @Delete(':id')
    // @UseGuards(AuthGuard(), RolesGuard)
    // @Scopes('admin:*', 'metadata:delete')
    // @UsePipes(new JoiValidationPipe({
    //     param: {
    //         id: MongoIdSchema,
    //         lang: LanguageSchema,
    //     }
    // }))
    // @ApiParam({ name: 'id', required: true, description: 'Metadata ID to delete' })
    // async remove(
    //     @Param('id') id: string,
    //     @User() user: UserDocument,
    //     @Param('lang') lang: string
    // ) {
    //     return this.metadataService.delete(id, user);
    // }
} 