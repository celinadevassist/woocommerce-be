import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException, Logger } from '@nestjs/common';
const logger = new Logger('systemError');

@Injectable()
export class JoiValidationPipe implements PipeTransform {
  constructor(private readonly schema: {body?: any, query?: any, param?: any}) {}

  transform(value: any, metadata: ArgumentMetadata) {
    const schemaObject = this.schema[metadata.type]?.[metadata.data] || this.schema[metadata.type];

    const { error, value: validatedValue } = schemaObject?.validate ? schemaObject.validate(value) : {error: undefined, value: value};

    if (error) {
      logger.error(error, 'Front-End: validation error');
      throw new BadRequestException({error, value});
    }

    return validatedValue || value;
  }
}
