import { 
  BadRequestException, 
  ConflictException, 
  forwardRef, 
  Inject, 
  Injectable, 
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ForbiddenException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { IMetadata } from './interface';
import { ActionLogService } from 'src/services/actionLog.service';
import { Metadata, MetadataDocument } from './schema';
import { CreateMetadataDto } from './dto.create';
import { UpdateMetadataDto } from './dto.update';
import { QueryMetadataDto } from './dto.query';
import { MetadataOrderEnum, SortTypeEnum } from './enum';

@Injectable()
export class MetadataService {
  constructor(
    @InjectModel(Metadata.name) private readonly metadataModel: Model<MetadataDocument>,
    @InjectConnection() private readonly connection: Connection,
    @Optional() @Inject(forwardRef(() => ActionLogService)) private readonly actionLogService: ActionLogService,
  ) { }

  // Removed strict create method - using createOrUpdate as the main create method
  // async create(creator, data: CreateMetadataDto, lang?: string): Promise<IMetadata> {
  //   try {
  //     // Check if metadata already exists for this user and module
  //     const exists = await this.metadataModel.findOne({ 
  //       userId: data.userId, 
  //       forModule: data.forModule 
  //     });
  //     
  //     if (exists) {
  //       throw new ConflictException(`Metadata for user ${data.userId} and module ${data.forModule} already exists`);
  //     }

  //     const newMetadata = await this.metadataModel.create(data);
  //     
  //     // Optionally log the action if service is available
  //     try {
  //       if (this.actionLogService) {
  //         await this.actionLogService.create({
  //           type: 'public',
  //           title: 'Metadata Created',
  //           description: `Created metadata for module: ${data.forModule}`,
  //           onId: newMetadata._id,
  //           userId: creator?._id
  //         });
  //       }
  //     } catch (logError) {
  //       console.error('Error logging metadata creation:', logError);
  //     }
  //     
  //     return this.toInterface(newMetadata);
  //   } catch (error) {
  //     if (error.code === 11000) {
  //       throw new ConflictException('Metadata for this user and module already exists');
  //     }
  //     throw error;
  //   }
  // }

  async createOrUpdate(creator, data: CreateMetadataDto, lang?: string): Promise<IMetadata> {
    try {
      // Check if metadata already exists for this user and module
      const exists = await this.metadataModel.findOne({ 
        userId: data.userId, 
        forModule: data.forModule 
      });
      
      if (exists) {
        // Merge the new meta with existing meta instead of replacing
        const mergedMeta = {
          ...exists.meta, // Keep existing meta properties
          ...data.meta    // Add/override with new meta properties
        };
        
        // Update existing metadata with merged meta
        const updateData = {
          ...data,
          meta: mergedMeta,
          updatedAt: new Date()
        };
        
        const updatedMetadata = await this.metadataModel.findByIdAndUpdate(
          exists._id,
          { $set: updateData },
          { new: true }
        );
        
        // Optionally log the action if service is available
        try {
          if (this.actionLogService) {
            await this.actionLogService.create({
              type: 'public',
              title: 'Metadata Updated',
              description: `Updated existing metadata for module: ${data.forModule}`,
              onId: exists._id,
              userId: creator?._id
            });
          }
        } catch (logError) {
          console.error('Error logging metadata update:', logError);
        }
        
        return this.toInterface(updatedMetadata);
      } else {
        // Create new metadata
        const newMetadata = await this.metadataModel.create(data);
        
        // Optionally log the action if service is available
        try {
          if (this.actionLogService) {
            await this.actionLogService.create({
              type: 'public',
              title: 'Metadata Created',
              description: `Created metadata for module: ${data.forModule}`,
              onId: newMetadata._id,
              userId: creator?._id
            });
          }
        } catch (logError) {
          console.error('Error logging metadata creation:', logError);
        }
        
        return this.toInterface(newMetadata);
      }
    } catch (error) {
      throw error;
    }
  }

  async get(filters: QueryMetadataDto, lang?: string) {
    let skip;
    const pipeLine: any = [
      { $match: await this.queryMaker(filters) },
    ];

    if (filters.page && filters.size) {
      skip = (parseInt(filters.page.toString(), 10) - 1) * parseInt(filters.size.toString(), 10);
      pipeLine.push({ $skip: skip });
      pipeLine.push({ $limit: parseInt(filters.size.toString(), 10) });
    }
    
    if (filters.orderBy && filters.sortType) {
      pipeLine.splice(1, 0, this.sortMaker(filters));
    }

    const results = await this.metadataModel.aggregate(pipeLine);
    return results.map(result => this.toInterface(result));
  }

  async getAll(query: QueryMetadataDto, creator: any) {
    const filter: any = {};
    
    // Add search functionality
    if (query.search) {
      filter.$text = { $search: query.search };
    }
    
    // Add specific filters
    if (query.userId) filter.userId = query.userId;
    if (query.forModule) filter.forModule = query.forModule;
    
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const skip = (page - 1) * size;

    // Build sort object
    const sort: any = {};
    if (query.orderBy && query.sortType) {
      sort[query.orderBy] = query.sortType === SortTypeEnum.ASCENDING ? 1 : -1;
    } else {
      sort.createdAt = -1; // Default sort by creation date descending
    }

    const [metadata, total] = await Promise.all([
      this.metadataModel.find(filter).sort(sort).skip(skip).limit(size).exec(),
      this.metadataModel.countDocuments(filter)
    ]);

    return {
      data: metadata.map(m => this.toInterface(m)),
      total,
      page,
      size,
    };
  }

  async findById(id: string, creator?: any): Promise<IMetadata> {
    const metadata = await this.metadataModel.findById(id).exec();
    if (!metadata) {
      throw new NotFoundException(`Metadata with ID ${id} not found`);
    }
    return this.toInterface(metadata);
  }

  async findByUserAndModule(userId: string, forModule: string): Promise<IMetadata | null> {
    const metadata = await this.metadataModel.findOne({ userId, forModule }).exec();
    return metadata ? this.toInterface(metadata) : null;
  }

  async update(id: string, user, data: UpdateMetadataDto, lang?: string): Promise<IMetadata> {
    const metadata = await this.metadataModel.findById(id);
    if (!metadata) {
      throw new NotFoundException(`Metadata with ID ${id} not found`);
    }

    // Check if trying to update userId/forModule combination that already exists
    if ((data.userId || data.forModule) && (data.userId !== metadata.userId.toString() || data.forModule !== metadata.forModule)) {
      const exists = await this.metadataModel.findOne({
        userId: data.userId || metadata.userId,
        forModule: data.forModule || metadata.forModule,
        _id: { $ne: id }
      });
      
      if (exists) {
        throw new ConflictException('Metadata for this user and module combination already exists');
      }
    }
    
    try {
      // For PATCH updates, also merge meta if it exists
      let updateData;
      if (data.meta && metadata.meta) {
        updateData = {
          ...data,
          meta: {
            ...metadata.meta, // Keep existing meta properties
            ...data.meta      // Add/override with new meta properties
          },
          updatedAt: new Date()
        };
      } else {
        updateData = { ...data, updatedAt: new Date() };
      }
      
      const updatedMetadata = await this.metadataModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );
      
      // Optionally log the action if service is available
      try {
        if (this.actionLogService) {
          await this.actionLogService.create({
            type: 'public',
            title: 'Metadata Updated',
            description: `Updated metadata for module: ${updatedMetadata.forModule}`,
            onId: id,
            userId: user?._id
          });
        }
      } catch (logError) {
        console.error('Error logging metadata update:', logError);
      }
      
      return this.toInterface(updatedMetadata);
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Metadata for this user and module combination already exists');
      }
      throw error;
    }
  }

  // Commented out delete method as per requirements
  // async delete(id: string, user): Promise<{ success: boolean; message: string }> {
  //   try {
  //     const metadata = await this.metadataModel.findById(id);
  //     if (!metadata) {
  //       return { success: false, message: 'Metadata not found' };
  //     }

  //     await this.metadataModel.findByIdAndDelete(id);

  //     // Optionally log the action if service is available
  //     try {
  //       if (this.actionLogService) {
  //         await this.actionLogService.create({
  //           type: 'public',
  //           title: 'Metadata Deleted',
  //           description: `Deleted metadata for module: ${metadata.forModule}`,
  //           onId: id,
  //           userId: user?._id
  //         });
  //       }
  //     } catch (logError) {
  //       console.error('Error logging metadata deletion:', logError);
  //     }

  //     return { 
  //       success: true, 
  //       message: 'Metadata deleted successfully' 
  //     };
  //   } catch (error) {
  //     console.error('Error deleting metadata:', error);
  //     throw new InternalServerErrorException('Failed to delete metadata');
  //   }
  // }

  private async queryMaker(filters: QueryMetadataDto) {
    const query: any = {};

    if (filters.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }
    
    if (filters.forModule) {
      query.forModule = filters.forModule;
    }

    // Handle search in meta object
    if (filters.search) {
      // Create a text search on stringified meta values
      query.$or = [
        { 'meta': { $regex: filters.search, $options: 'i' } },
        // You can add more specific search fields here if needed
      ];
    }

    return query;
  }

  private sortMaker(filters: QueryMetadataDto) {
    const sortObj: any = {};
    
    if (filters.orderBy && filters.sortType) {
      const sortDirection = filters.sortType === SortTypeEnum.ASCENDING ? 1 : -1;
      sortObj[filters.orderBy] = sortDirection;
    }
    
    return { $sort: sortObj };
  }

  private toInterface(doc: MetadataDocument): IMetadata {
    if (!doc) return null;
    
    return {
      _id: doc._id.toString(),
      userId: doc.userId,
      forModule: doc.forModule,
      meta: doc.meta,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}