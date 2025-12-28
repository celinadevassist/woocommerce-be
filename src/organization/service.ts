import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from './schema';
import { CreateOrganizationDto } from './dto.create';
import { UpdateOrganizationDto } from './dto.update';
import { QueryOrganizationDto } from './dto.query';
import { IOrganization, IOrganizationResponse } from './interface';
import { OrganizationMemberRole } from './enum';
import { UserDocument } from '../schema/user.schema';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
  ) {}

  /**
   * Create a new organization
   */
  async create(user: UserDocument, dto: CreateOrganizationDto): Promise<IOrganization> {
    // Generate slug if not provided
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check if slug already exists
    const existingOrg = await this.organizationModel.findOne({ slug, isDeleted: false });
    if (existingOrg) {
      throw new ConflictException('Organization with this slug already exists');
    }

    // Create organization with owner as first member
    const organization = await this.organizationModel.create({
      name: dto.name,
      slug,
      ownerId: user._id,
      billingEmail: dto.billingEmail || user.email,
      members: [
        {
          userId: user._id,
          role: OrganizationMemberRole.OWNER,
          storeAccess: 'all',
          invitedAt: new Date(),
          acceptedAt: new Date(),
        },
      ],
    });

    return this.toInterface(organization);
  }

  /**
   * Get organizations for a user (as owner or member)
   */
  async findByUser(userId: string, query: QueryOrganizationDto): Promise<IOrganizationResponse> {
    const filter: any = {
      isDeleted: false,
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        { 'members.userId': new Types.ObjectId(userId) },
      ],
    };

    if (query.keyword) {
      filter.name = { $regex: query.keyword, $options: 'i' };
    }

    const page = query.page || 1;
    const size = query.size || 10;
    const skip = (page - 1) * size;

    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort: any = { [sortField]: sortOrder };

    const [organizations, total] = await Promise.all([
      this.organizationModel.find(filter).sort(sort).skip(skip).limit(size),
      this.organizationModel.countDocuments(filter),
    ]);

    return {
      organizations: organizations.map((org) => this.toInterface(org)),
      pagination: {
        total,
        page,
        size,
        pages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Get organization by ID
   */
  async findById(id: string, userId: string): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user has access
    if (!this.userHasAccess(organization, userId)) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    return this.toInterface(organization);
  }

  /**
   * Update organization
   */
  async update(id: string, userId: string, dto: UpdateOrganizationDto): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user is owner or admin
    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to update this organization');
    }

    // Update fields
    if (dto.name) organization.name = dto.name;
    if (dto.billingEmail) organization.billingEmail = dto.billingEmail;

    await organization.save();
    return this.toInterface(organization);
  }

  /**
   * Soft delete organization
   */
  async delete(id: string, userId: string): Promise<void> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Only owner can delete
    if (organization.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the owner can delete this organization');
    }

    organization.isDeleted = true;
    await organization.save();
  }

  /**
   * Get store count for organization (to be called from Store service)
   */
  async getStoreCount(organizationId: string): Promise<number> {
    // This will be implemented when Store module is created
    // For now, return 0
    return 0;
  }

  // ==================== MEMBER MANAGEMENT ====================

  /**
   * Get all members of an organization
   */
  async getMembers(id: string, userId: string): Promise<any[]> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!this.userHasAccess(organization, userId)) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    return organization.members.map((m: any) => ({
      id: m._id?.toString() || m.userId.toString(),
      userId: m.userId.toString(),
      role: m.role,
      storeAccess: m.storeAccess,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      status: m.acceptedAt ? 'active' : 'pending',
    }));
  }

  /**
   * Invite a new member to the organization
   */
  async inviteMember(
    id: string,
    userId: string,
    memberUserId: string,
    role: OrganizationMemberRole,
    storeAccess: string[] | 'all' = 'all',
  ): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user can invite (owner or admin)
    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to invite members');
    }

    // Check if user is already a member
    const existingMember = organization.members.find(
      (m) => m.userId.toString() === memberUserId,
    );
    if (existingMember) {
      throw new ConflictException('User is already a member of this organization');
    }

    // Cannot invite as OWNER
    if (role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Cannot invite member as OWNER role');
    }

    // Add new member
    organization.members.push({
      userId: new Types.ObjectId(memberUserId),
      role,
      storeAccess,
      invitedAt: new Date(),
    } as any);

    await organization.save();
    return this.toInterface(organization);
  }

  /**
   * Update a member's role or store access
   */
  async updateMember(
    id: string,
    userId: string,
    memberId: string,
    updates: { role?: OrganizationMemberRole; storeAccess?: string[] | 'all' },
  ): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user can manage
    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to update members');
    }

    // Find the member
    const memberIndex = organization.members.findIndex(
      (m) => m.userId.toString() === memberId,
    );

    if (memberIndex === -1) {
      throw new NotFoundException('Member not found');
    }

    const member = organization.members[memberIndex];

    // Cannot change owner's role
    if (member.role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Cannot change the owner\'s role');
    }

    // Cannot change to OWNER role
    if (updates.role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Cannot change member to OWNER role');
    }

    // Update fields
    if (updates.role) {
      (organization.members[memberIndex] as any).role = updates.role;
    }
    if (updates.storeAccess !== undefined) {
      (organization.members[memberIndex] as any).storeAccess = updates.storeAccess;
    }

    await organization.save();
    return this.toInterface(organization);
  }

  /**
   * Remove a member from the organization
   */
  async removeMember(id: string, userId: string, memberId: string): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user can manage
    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to remove members');
    }

    // Find the member
    const memberIndex = organization.members.findIndex(
      (m) => m.userId.toString() === memberId,
    );

    if (memberIndex === -1) {
      throw new NotFoundException('Member not found');
    }

    const member = organization.members[memberIndex];

    // Cannot remove owner
    if (member.role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Cannot remove the owner from the organization');
    }

    // Remove member
    organization.members.splice(memberIndex, 1);
    await organization.save();

    return this.toInterface(organization);
  }

  /**
   * Accept a pending invitation
   */
  async acceptInvitation(id: string, userId: string): Promise<IOrganization> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Find the member
    const memberIndex = organization.members.findIndex(
      (m) => m.userId.toString() === userId,
    );

    if (memberIndex === -1) {
      throw new NotFoundException('You do not have an invitation to this organization');
    }

    const member = organization.members[memberIndex];

    if (member.acceptedAt) {
      throw new BadRequestException('Invitation already accepted');
    }

    // Mark as accepted
    (organization.members[memberIndex] as any).acceptedAt = new Date();
    await organization.save();

    return this.toInterface(organization);
  }

  /**
   * Get available stores for member assignment
   */
  async getStoresForMemberAccess(id: string, userId: string): Promise<{ id: string; name: string }[]> {
    // This will need Store module integration
    // For now, return empty array
    return [];
  }

  /**
   * Check if organization can add more stores
   * Always returns true - no store limit, each store pays $19/month
   */
  async canAddStore(organizationId: string): Promise<boolean> {
    const organization = await this.organizationModel.findById(organizationId);
    return !!organization;
  }

  // Helper methods
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private userHasAccess(organization: OrganizationDocument, userId: string): boolean {
    if (organization.ownerId.toString() === userId) return true;
    return organization.members.some((m) => m.userId.toString() === userId);
  }

  private userCanManage(organization: OrganizationDocument, userId: string): boolean {
    if (organization.ownerId.toString() === userId) return true;
    const member = organization.members.find((m) => m.userId.toString() === userId);
    return member?.role === OrganizationMemberRole.ADMIN;
  }

  private toInterface(doc: OrganizationDocument): IOrganization {
    const obj = doc.toObject();
    return {
      _id: obj._id.toString(),
      name: obj.name,
      slug: obj.slug,
      ownerId: obj.ownerId.toString(),
      members: obj.members.map((m: any) => ({
        userId: m.userId.toString(),
        role: m.role,
        storeAccess: m.storeAccess,
        invitedAt: m.invitedAt,
        acceptedAt: m.acceptedAt,
      })),
      billingEmail: obj.billingEmail,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}
