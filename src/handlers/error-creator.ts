import { BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import {i18n} from '../i18n';
const logger = new Logger('systemError');

export const generateBussinessError = (key, lang, code) => {
    const msg = i18n.__({ phrase: key, locale: lang })
    switch (code){
        case 400:
            throw new BadRequestException({statusCode: 400, message: msg, error: 'Bad Request', type: 'BUSSINESS_ERROR'});
        case 409:
            throw new ConflictException({statusCode: 409, message: msg, error: 'Conflict', type: 'BUSSINESS_ERROR'});
        case 401:
            throw new UnauthorizedException({statusCode: 401, message: msg, error: 'Unauthorized', type: 'BUSSINESS_ERROR'});
        case 403:
            throw new ForbiddenException({statusCode: 403, message: msg, error: 'Forbidden', type: 'BUSSINESS_ERROR'});
        case 405:
            throw new ForbiddenException({statusCode: 405, message: msg, error: 'Bad Request', type: 'BUSSINESS_ERROR'});
        case 500:
            logger.error(msg);
            throw new InternalServerErrorException({statusCode: 500, message: msg, error: 'Internal Server Error', type: 'BUSSINESS_ERROR'});
        default:
            throw new BadRequestException({statusCode: 400, message: msg, error: 'Bad Request', type: 'BUSSINESS_ERROR'});
    }
}