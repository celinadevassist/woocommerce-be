import { Controller, Get, UsePipes, UseGuards, Query, Body, Patch, Param, Post, Delete, UploadedFile, UseInterceptors, Res, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';

import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

import * as Joi from 'joi';


import { Scopes, User } from '../decorators';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../guards';
import { JoiValidationPipe } from '../pipes';

import { ActionLogService } from 'src/services/actionLog.service';
import { UserDocument } from 'src/schema';



@ApiTags('Action Logs')
@ApiBearerAuth()
@Controller(':lang/action-log')

export class ActionLogController {
    constructor(
        private readonly actionLogService: ActionLogService,
    ) { }

    @Get()
    @UseGuards(AuthGuard(), RolesGuard)
    @UsePipes(new JoiValidationPipe({

    }))
    async myActionLog(@User() creator: UserDocument) {
        return await this.actionLogService.get(creator);
    }

}
