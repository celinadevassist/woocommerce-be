import {
  forwardRef,
  Inject,
  Injectable,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { QueryUserDTO, PaginationQueryDTO } from '../dtos';
import { SMSService } from './sms.service';
import { AuthService } from 'src/auth/auth.service';
import { ImageService } from './image.service';
import getUserAttreputes from './getUserAttreputes';
import { User, UserDocument } from 'src/schema';
import {
  BusinessException,
  SystemErrorException,
  ResourceNotFoundException,
  DuplicateResourceException,
  AccessDeniedException,
} from 'src/shared/exceptions/business.exception';
import { BusinessErrorCode } from 'src/shared/exceptions/business-error.codes';
import { S3UploadService } from 'src/modules/s3-upload';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>, // 👈 Changed from 'users'
    @Inject(forwardRef(() => SMSService))
    private readonly smsService: SMSService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    @Inject(forwardRef(() => ImageService))
    private readonly imageService: ImageService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async UpdateProfile(userData, creator: UserDocument, lang): Promise<any> {
    const toUnset = {};
    const exist = await this.userModel.findOne({ _id: creator._id });
    if (!exist) {
      throw new ResourceNotFoundException('User', creator._id);
    }

    if (userData.password) {
      userData.hashKey = await bcrypt.genSalt();
      userData.password = await this.authService.encryptPassword(
        userData.password,
        userData.hashKey,
      );
    }

    if (userData.email && userData.email !== exist.email) {
      const repeatedEmail = await this.userModel.findOne({
        email: userData.email,
      });
      if (repeatedEmail) {
        throw new DuplicateResourceException('User', 'email', userData.email);
      }
    }

    userData.updatedAt = new Date();
    const user = await this.userModel.findOneAndUpdate(
      { _id: creator._id },
      { $unset: toUnset, $set: userData },
      { new: true },
    );
    const token = await this.authService.retrieveToken(
      exist._id,
      exist.email,
      exist.role,
    );
    return { token, user: getUserAttreputes(user.toObject()) };
  }

  async updateProfileImage(
    data,
    creator: UserDocument,
    lang,
    userId,
  ): Promise<any> {
    const exist = await this.userModel.findOne({ _id: userId });
    if (!exist) {
      throw new ResourceNotFoundException('User', userId);
    }

    // Check if S3 is configured
    if (!this.s3UploadService.isConfigured()) {
      throw new SystemErrorException(
        'uploading profile image',
        'S3 is not configured. Please check AWS credentials.',
      );
    }

    // If user has existing S3 image, delete it first
    if (exist.imageS3Key) {
      try {
        await this.s3UploadService.deleteFile(exist.imageS3Key);
        this.logger.log(`Deleted old profile image: ${exist.imageS3Key}`);
      } catch (error) {
        this.logger.error('Failed to delete old profile image from S3:', error);
        // Continue with upload even if deletion fails
      }
    }

    // Upload new image to S3
    const uploadResult = await this.s3UploadService.uploadProfileImage(
      data,
      data.originalname,
      userId,
    );

    // Update user document with new image URL and S3 key
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          image: uploadResult.url,
          imageS3Key: uploadResult.key,
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    return updatedUser;
  }

  async deleteProfileImage(userId: string): Promise<any> {
    const exist = await this.userModel.findOne({ _id: userId });
    if (!exist) {
      throw new ResourceNotFoundException('User', userId);
    }

    // If user has S3 image, delete it
    if (exist.imageS3Key) {
      try {
        await this.s3UploadService.deleteFile(exist.imageS3Key);
        this.logger.log(`Deleted profile image: ${exist.imageS3Key}`);
      } catch (error) {
        this.logger.error('Failed to delete profile image from S3:', error);
        // Continue with database update even if S3 deletion fails
      }
    }

    // Remove image URL and S3 key from user document
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $unset: { image: '', imageS3Key: '' },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    );

    return updatedUser;
  }

  async getProfile(id: string, creator, lang): Promise<any> {
    try {
      const user = await this.userModel.findOne({ _id: creator._id });
      if (!user) {
        throw new ResourceNotFoundException('User', creator._id);
      }

      const profileImage = await this.imageService.findOne({
        userId: creator._id,
      });

      // Create a user object with the image URL from profile
      const userObject = user.toObject();
      // Add the image URL to the user object
      if (profileImage?.imageUrl) {
        userObject.image = profileImage.imageUrl;
      }

      return {
        ...getUserAttreputes(userObject),
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new SystemErrorException('fetching user profile', err?.message);
    }
  }

  async create(userData, creator, lang): Promise<any> {
    if ((userData?.email && userData.email != '') || 0) {
      const userExist = await this.userModel.findOne({ email: userData.email });
      if (userExist)
        throw new DuplicateResourceException('User', 'email', userData.email);
    }
    const newUser = await this.userModel.create(userData);
    return newUser;
  }

  async update(
    id: string,
    userData,
    creator: UserDocument,
    lang,
  ): Promise<any> {
    const toUnset = {};
    const exist = await this.userModel.findOne({ _id: id });
    if (!exist) {
      throw new ResourceNotFoundException('User', id);
    }

    if (userData.email && userData.email !== exist?.email) {
      const repeatedEmail = await this.userModel.findOne({
        email: userData.email,
      });
      if (repeatedEmail) {
        throw new DuplicateResourceException('User', 'email', userData.email);
      }
    }

    userData.updatedAt = new Date();
    return await this.userModel.findOneAndUpdate(
      { _id: id },
      { $unset: toUnset, $set: userData },
      { new: true },
    );
  }

  async updateAuthorizedKhadem(id) {
    const userData = {
      updatedAt: new Date(),
      authorizedKhadem: true,
    };
    await this.userModel.updateOne({ _id: id }, userData);
  }

  async roleChange(id: string, data, lang): Promise<any> {
    const userDate = await this.userModel.findOne({ _id: id });

    if (!userDate) {
      throw new ResourceNotFoundException('User', id);
    }

    if (data.role === userDate.role)
      throw new BusinessException(
        BusinessErrorCode.INVALID_INPUT,
        'Role is already set to the requested value',
        { currentRole: userDate.role, requestedRole: data.role },
      );

    let admins = [];
    if (data.role === 'user') {
      admins = await this.userModel.find({ role: 'admin' });
      if (admins.length === 1)
        throw new AccessDeniedException(
          'role change',
          'Cannot remove the last admin user',
        );
    }
    data['updatedAt'] = new Date();
    return await this.userModel.updateOne(
      { _id: id },
      { $set: data },
      { new: true },
    );
  }

  async get(filters: QueryUserDTO, lang): Promise<any> {
    // Extract pagination parameters from filters if present
    const page = filters['page'] ? parseInt(filters['page'].toString()) : 1;
    const limit = filters['limit'] ? parseInt(filters['limit'].toString()) : 20;
    const skip = (page - 1) * limit;

    // Build the query
    const query = this.queryMaker(filters);

    // Count total records
    const total = await this.userModel.countDocuments(query);

    // Get paginated records
    const records = await this.userModel
      .find(query)
      .sort({ createdAt: 1 }) // Sort by createdAt in descending order
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      data: records,
      pagination: {
        total,
        current: page,
        startAt: skip + 1,
        endAt: skip + records.length,
        limit,
      },
    };
  }

  async getOne(id: string): Promise<any> {
    const data = await this.userModel.findOne({ _id: id });
    if (data) return data;
    throw new ResourceNotFoundException('User', id);
  }

  async remove(
    id: string,
    lang,
  ): Promise<{ message: string; deletedCount: number }> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new ResourceNotFoundException('User', id);
    }

    if (user.role === 'admin') {
      throw new AccessDeniedException('user deletion', 'Cannot delete admin users');
    }
    const response = await this.userModel.deleteOne({ _id: id });
    return {
      message: response?.deletedCount
        ? 'Data deleted successfully'
        : 'not valid',
      deletedCount: response.deletedCount,
    };
  }

  queryMaker(filters) {
    const query: any = {};

    // Skip pagination-related parameters
    const paginationParams = ['page', 'limit', 'search', 'skill', 'location'];
    const filteredFilters = { ...filters };

    // Handle the standard filters
    if (filteredFilters.role) {
      query.role = filteredFilters.role;
    }
    if (filteredFilters.name) {
      query.name = filteredFilters.name;
    }
    if (filteredFilters.status) {
      query.status = filteredFilters.status;
    }
    if (filteredFilters._id) {
      query._id = filteredFilters._id;
    }
    if (filteredFilters.createdAt) {
      filteredFilters.createdAt = isNaN(filteredFilters.createdAt)
        ? filteredFilters.createdAt
        : parseInt(filteredFilters.createdAt, 10);
      query.createdAt = { $gt: new Date(filteredFilters.createdAt) };
    }

    // Handle additional filters that may be in the query
    if (filteredFilters['search']) {
      const searchTerm = filteredFilters['search'];
      query.$or = [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    if (filteredFilters['skill']) {
      query.skills = { $in: [new RegExp(filteredFilters['skill'], 'i')] };
    }

    if (filteredFilters['location']) {
      query.location = { $regex: filteredFilters['location'], $options: 'i' };
    }

    return query;
  }

  sortMaker(filters) {
    const type = filters.sortType === 'ASCENDING' ? 1 : -1;
    const sortObj = { $sort: {} };
    sortObj.$sort[filters.sortProperty] = type;
    return sortObj;
  }

  // Get all users that are visible to the community
  async getCommunityVisibleUsers(
    lang: string,
    user: UserDocument,
    pagination: PaginationQueryDTO = { page: 1, limit: 10 },
  ): Promise<any> {
    try {
      this.logger.log(
        'getCommunityVisibleUsers called with user:',
        user?._id ? user._id.toString() : 'undefined',
      );

      // const isAuthenticated = !!(user && (user._id));
      // if (!isAuthenticated) {
      //   this.logger.log('User is not authenticated');
      //   throw new AccessDeniedException('community', 'You must be a member to access this community');
      // }

      // Set defaults if not provided
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const skip = (page - 1) * limit;

      // Build query filter
      const filter: any = { visibleToCommunity: true };

      // Add search filter if provided
      if (pagination.search) {
        filter.$or = [
          { firstName: { $regex: pagination.search, $options: 'i' } },
          { lastName: { $regex: pagination.search, $options: 'i' } },
          { bio: { $regex: pagination.search, $options: 'i' } },
        ];
      }

      // Add skill filter if provided
      if (pagination.skill) {
        filter.skills = { $in: [new RegExp(pagination.skill, 'i')] };
      }

      // Add location filter if provided
      if (pagination.location) {
        filter.location = { $regex: pagination.location, $options: 'i' };
      }

      this.logger.log('Query filter:', filter);

      // Find all users matching the filter
      this.logger.log('Searching for users with filter');
      const total = await this.userModel.countDocuments(filter);
      const users = await this.userModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .lean();

      this.logger.log(`Found ${users?.length || 0} users matching the filter`);
      if (!users || users.length === 0) {
        return {
          data: [],
          pagination: {
            total,
            current: page,
            startAt: skip + 1,
            endAt: skip + (users?.length || 0),
            limit,
          },
        };
      }

      // Transform users to return only necessary information
      const data = users.map((user) => {
        // Return only the public information
        return {
          _id: user._id,
          name:
            user.firstName && user.lastName
              ? `${user.firstName} ${user.lastName}`
              : user.firstName || user.lastName || 'Unknown',
          bio: user.bio,
          image: user.image,
          skills: user.skills || [],
          socialLinks: user.socialLinks || {},
          location: user.location,
          lastActive: user.lastActive,
          // Add any other fields that should be visible to community members
        };
      });

      return {
        data,
        pagination: {
          total,
          current: page,
          startAt: skip + 1,
          endAt: skip + users.length,
          limit,
        },
      };
    } catch (error) {
      this.logger.error('Error in getCommunityVisibleUsers:', error);
      if (error instanceof BusinessException) {
        throw error;
      }
      throw new SystemErrorException('fetching community users', error?.message);
    }
  }
}
