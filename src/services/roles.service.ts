import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IRole, IPagination } from '../interfaces';
import { QueryRoleDTO } from '../dtos';
import { generateBussinessError } from '../handlers/error-creator';
import { UserDocument } from 'src/schema';

@Injectable()
export class RoleService {
  constructor(
    @InjectModel('Role') private readonly roleModel: Model<IRole>,
  ) { }
  async create(roleData, creator: UserDocument, lang): Promise<IRole> {
    if (await this.roleModel.findOne({ name: roleData.name })) {
      return generateBussinessError('role_name_already_exist', lang, 400)
    }
    return await this.roleModel.create({ ...roleData, creator: creator._id });
  }

  async update(id: string, roleData, creator: UserDocument, lang): Promise<IRole> {
    // if(!new Types.ObjectId.isValid(id)) {
    //   throw new BadRequestException('Incorrect ID');
    // }
    const nameExist = roleData.name ? await this.roleModel.findOne({ name: roleData.name }) : undefined
    if (nameExist && nameExist._id !== id) {
      return generateBussinessError('role_name_already_exist', lang, 400)
    }
    return await this.roleModel.findOneAndUpdate(
      { _id: id },
      { $set: roleData },
      { new: true }
    );
  }
  async get(filters: QueryRoleDTO, lang): Promise<{ pagination: IPagination, records: IRole[] }> {
    let skip;
    const pipeLine: any = [
      { $match: this.queryMaker(filters) },
    ];
    if (filters.page && filters.size) {
      skip = (parseInt(filters.page, 10) - 1) * parseInt(filters.size, 10);
      pipeLine.push({ $skip: skip });
      pipeLine.push({ $limit: parseInt(filters.size, 10) });
    }
    // get the collection records count (for pagination)
    const count: number = await this.roleModel.find(this.queryMaker(filters)).countDocuments();

    // get the records
    const records = await this.roleModel.aggregate(pipeLine);
    return {
      pagination: {
        total: count,
        current: records.length,
        startAt: skip || 1,
        endAt: skip ? (skip + parseInt(filters.size, 10)) : records.length,
      }, records
    };
  }
  async getById(id: string, lang): Promise<IRole> {
    // if (!new Types.ObjectId.isValid(id)) {
    //   throw new BadRequestException('Incorrect ID');
    // }
    return await this.roleModel.findOne({ _id: id });
  }
  async getByName(name: string, lang): Promise<IRole> {
    return await this.roleModel.findOne({ name });
  }
  async remove(id: string, lang): Promise<{ message: string, deletedCount: number }> {
    // if (!new Types.ObjectId.isValid(id)) {
    //   throw new BadRequestException('Incorrect ID');
    // }
    const response = await this.roleModel.deleteOne({ _id: id });
    return {
      message: response?.deletedCount ? 'Data deleted successfully' : 'not valid',
      deletedCount: response.deletedCount,
    };
  }

  queryMaker(filters) {
    const query: any = {};
    if (filters.scope) {
      query.scopes = { $elemMatch: { $eq: filters.scope } };
    }
    if (filters.name) {
      query.name = filters.name;
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
