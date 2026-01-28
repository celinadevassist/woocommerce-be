import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Res,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateBussinessError } from '../handlers/error-creator';
import {
  SystemErrorException,
  InvalidInputException,
} from 'src/shared/exceptions/business.exception';

import { IImage } from '../interfaces';

@Injectable()
export class ImageService {
  constructor(
    @InjectModel('Image') private readonly imageModel: Model<IImage>,
  ) {}

  async get(filters) {
    try {
      const pipeLine: any = [
        { $match: await this.queryMaker(filters) },
        {
          $lookup: {
            from: 'service',
            localField: 'serviceId',
            foreignField: '_id',
            as: 'serviceData',
          },
        },
      ];
      return await this.imageModel.aggregate(pipeLine);
    } catch (error) {
      if (error instanceof SystemErrorException) throw error;
      throw new SystemErrorException('image retrieval', error?.message);
    }
  }

  async findOne(data) {
    try {
      return await this.imageModel.findOne(data);
    } catch (error) {
      if (error instanceof SystemErrorException) throw error;
      throw new SystemErrorException('image lookup', error?.message);
    }
  }

  async create_update(filter, data): Promise<IImage> {
    try {
      data.updatedAt = new Date();
      return await this.imageModel.findOneAndUpdate(
        filter,
        { $set: data },
        { new: true, upsert: true },
      );
    } catch (error) {
      if (error instanceof SystemErrorException) throw error;
      throw new SystemErrorException('image create/update', error?.message);
    }
  }

  async delete(id: string): Promise<{ message: string; deletedCount: number }> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new InvalidInputException('id', id, 'Valid MongoDB ObjectId');
      }
      const response = await this.imageModel.deleteOne({
        _id: new Types.ObjectId(id),
      });

      return {
        message: response?.deletedCount
          ? 'Data deleted successfully'
          : 'not valid',
        deletedCount: response?.deletedCount || 0,
      };
    } catch (error) {
      if (
        error instanceof InvalidInputException ||
        error instanceof SystemErrorException
      )
        throw error;
      throw new SystemErrorException('image deletion', error?.message);
    }
  }

  private async queryMaker(filters) {
    const query: any = {};

    if (filters.serviceId) {
      query.serviceId = new Types.ObjectId(filters.serviceId);
    }

    if (filters.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }
    return query;
  }

  sortMaker(filters) {
    const type = filters.sortType === 'ASCENDING' ? 1 : -1;
    const sortObj = { $sort: {} };
    sortObj.$sort[filters.sortProperty] = type;
    return sortObj;
  }
}
