import {
  Controller,
  Get,
  UsePipes,
  UseGuards,
  Query,
  Param,
  Body,
  Post,
  Patch,
  Delete,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { UserService } from '../services';

import { Scopes, User } from '../decorators';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../guards';
import { JoiValidationPipe } from '../pipes';
import { IPagination } from '../interfaces';
import {
  UpdateUserDTO,
  UpdateUserSchema,
  QueryUserDTO,
  QueryUserSchema,
  MongoIdSchema,
  LanguageSchema,
  UpdateMyProfileDTO,
  UpdateMyProfileSchema,
  CreateUserSchema,
  CreateUserDTO,
  RoleDTO,
  RoleSchema,
  FileBinaryUploadDto,
  PaginationQuerySchema,
  PaginationQueryDTO,
} from '../dtos';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserDocument } from 'src/schema';

@ApiTags('Users')
@ApiBearerAuth()
@Controller(':lang/user')
export class UserController {
  constructor(
    private readonly userService: UserService, //private readonly userBusinessService: UserBusiness,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @UsePipes(
    new JoiValidationPipe({
      body: CreateUserSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('admin')
  async createUser(
    @Body() userData: CreateUserDTO,
    @User() creator: UserDocument,
    @Param('lang') lang: string,
  ): Promise<UserDocument> {
    return await this.userService.create(userData, creator, lang);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateMyProfileSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard())
  async updateProfile(
    @Body() newData: UpdateMyProfileDTO,
    @User() creator: UserDocument,
    @Param('lang') lang: string,
  ): Promise<UserDocument> {
    return await this.userService.UpdateProfile(newData, creator, lang);
  }

  // file multipart
  @Patch('profile-image/:userId')
  @ApiOperation({ summary: 'Update user profile image' })
  @ApiResponse({
    status: 200,
    description: 'Profile image updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid file or user ID' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Cannot update other users profile image',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @UseGuards(AuthGuard(), RolesGuard)
  @ApiBody({
    description: 'file',
    type: FileBinaryUploadDto,
  })
  async updateProfileImage(
    @UploadedFile() file,
    @User() creator: UserDocument,
    @Param('lang') lang: string,
    @Param('userId') userId: string,
  ): Promise<UserDocument> {
    return await this.userService.updateProfileImage(
      file,
      creator,
      lang,
      userId,
    );
  }

  // Delete profile image
  @Delete('profile-image/:userId')
  @ApiOperation({ summary: 'Delete user profile image' })
  @ApiResponse({
    status: 200,
    description: 'Profile image deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only delete own profile image',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard())
  async deleteProfileImage(
    @User() creator: UserDocument,
    @Param('lang') lang: string,
    @Param('userId') userId: string,
  ): Promise<UserDocument> {
    // Only allow users to delete their own profile image (unless admin)
    if (creator._id.toString() !== userId && creator.role !== 'admin') {
      throw new ForbiddenException(
        'You can only delete your own profile image',
      );
    }
    return await this.userService.deleteProfileImage(userId);
  }

  // get user account
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UseGuards(AuthGuard())
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  async getProfile(
    @User() creator: UserDocument,
    @Param('lang') lang: string,
  ): Promise<UserDocument> {
    return await this.userService.getProfile(creator._id, creator, lang);
  }
  // update
  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: UpdateUserSchema,
      param: {
        id: MongoIdSchema,
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('admin')
  async update(
    @Body() user: UpdateUserDTO,
    @Param('id') id: string,
    @User() creator: UserDocument,
    @Param('lang') lang: string,
  ): Promise<UserDocument> {
    return await this.userService.update(id, user, creator, lang);
  }

  // update role by admin
  @Patch('role/:id')
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid role data' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UsePipes(
    new JoiValidationPipe({
      body: RoleSchema,
      param: {
        id: MongoIdSchema,
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('admin')
  async updateRole(
    @Body() data: RoleDTO,
    @Param('id') id: string,
    @Param('lang') lang: string,
  ): Promise<UserDocument> {
    return await this.userService.roleChange(id, data, lang);
  }

  // // get many
  @Get()
  @ApiOperation({ summary: 'Get all users with filters (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @UsePipes(
    new JoiValidationPipe({
      query: QueryUserSchema,
      param: {
        lang: LanguageSchema,
      },
    }),
  )
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('admin')
  async query(
    @Query() filters: QueryUserDTO,
    @Param('lang') lang: string,
  ): Promise<any> {
    return await this.userService.get(filters, lang);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid user ID' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
        id: MongoIdSchema,
      },
    }),
  )
  @UseGuards(AuthGuard(), RolesGuard)
  @Scopes('admin')
  async removeById(
    @Param('id') id: string,
    @Param('lang') lang: string,
  ): Promise<{ message: string; deletedCount: number }> {
    return await this.userService.remove(id, lang);
  }

  // Get community visible users
  @Get('community-members')
  @ApiOperation({ summary: 'Get community visible users' })
  @ApiResponse({
    status: 200,
    description: 'Community members retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid pagination parameters' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @UsePipes(
    new JoiValidationPipe({
      param: {
        lang: LanguageSchema,
      },
      query: PaginationQuerySchema,
    }),
  )
  @UseGuards(AuthGuard())
  async getCommunityVisibleUsers(
    @User() user: UserDocument,
    @Param('lang') lang: string,
    @Query() pagination: PaginationQueryDTO,
  ): Promise<any> {
    try {
      // Get all users where visibleToCommunity is true
      return await this.userService.getCommunityVisibleUsers(
        lang,
        user,
        pagination,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(
        'Failed to retrieve community members. Please try again later.',
      );
    }
  }
}
