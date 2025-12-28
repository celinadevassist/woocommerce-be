import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsMongoId } from 'class-validator';
import * as Joi from 'joi';
import { ModuleType } from './enum';

export class CreateMetadataDto {
  @ApiProperty({
    description: 'ID of the user this metadata belongs to',
    example: '60d21b4667d0d8992e610c85'
  })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Module this metadata is for',
    enum: ModuleType,
    example: ModuleType.EMAIL_MARKETING
  })
  @IsEnum(ModuleType)
  @IsNotEmpty()
  forModule: ModuleType;

  @ApiProperty({
    description: 'Metadata object containing flexible key-value pairs',
    example: { 
      erpnext: {
        baseUrl: "https://erpnext-marketing.sys-track-overview.site",
        token: "de668493e4344b0:38d508b26d63eba",
        communication_doctype: "User",
        communication_name: "Administrator",
        default_sender: "support@2zpoint.com",
        test_email: "test@example.com"
  }
    },
    type: 'object'
  })
  @IsObject()
  @IsNotEmpty()
  meta: Record<string, any>;
}

export const CreateMetadataSchema = Joi.object({
  userId: Joi.string().required(),
  forModule: Joi.string().valid(...Object.values(ModuleType)).required(),
  meta: Joi.object().required(),
}); 