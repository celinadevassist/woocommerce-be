import { ApiProperty } from '@nestjs/swagger';
import * as Joi from 'joi';

export class FileBase64UploadDto {
  @ApiProperty({ description: 'base64 file', type: 'string' })
  file: any;
}

export const FileBase64UploadSchema = Joi.object().keys({
  file: Joi.string().regex(/^(.+)$/),
})

// tslint:disable-next-line: max-classes-per-file
export class FileBinaryUploadDto {
  @ApiProperty({ description: 'Binary file', type: 'string', format: 'binary' })
  file: any;
}
