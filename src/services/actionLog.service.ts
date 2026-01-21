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
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IActionLog } from 'src/interfaces/actionLog.interface';

@Injectable()
export class ActionLogService {
  constructor(
    @InjectModel('ActionLog')
    private readonly actionLogModel: Model<IActionLog>,
  ) {}

  async create(data) {
    await this.actionLogModel.create(data);
  }

  async get(creator) {
    return await this.actionLogModel
      .find({ userId: creator._id, type: 'public' })
      .sort({ createdAt: -1 });
  }

  private async queryMaker(filters) {
    const query: any = {};

    if (filters.actionLog) {
      query.actionLog = filters.actionLog;
    }

    if (filters.classification) {
      query.classification = filters.classification;
    }

    if (filters.ownerId) {
      query.ownerId = filters.ownerId;
    }

    if (filters.color) {
      query.color = filters.color;
    }

    if (filters.size) {
      query.size = filters.size;
    }

    if (filters.customized) {
      query.customized = filters.customized;
    }

    if (filters.status) {
      filters.status === 'INSTOCK'
        ? (query.stockQuantity = { $gt: 0 })
        : (query.stockQuantity = { $lte: 0 });
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
