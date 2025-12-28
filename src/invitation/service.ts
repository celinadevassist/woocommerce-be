import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invitation, InvitationDocument, InvitationStatus } from './schema';
import { Organization, OrganizationDocument } from '../organization/schema';
import { User, UserDocument } from '../schema/user.schema';
import { OrganizationMemberRole } from '../organization/enum';
import { EmailService } from '../services/email.service';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly INVITATION_EXPIRY_DAYS = 7;

  constructor(
    @InjectModel(Invitation.name) private invitationModel: Model<InvitationDocument>,
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Send an invitation to join an organization
   */
  async sendInvitation(
    organizationId: string,
    userId: string,
    email: string,
    role: string,
    storeAccess: string[] | 'all' = 'all',
  ): Promise<{ message: string; invitation: any }> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if user can invite (owner or admin)
    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to invite members');
    }

    // Cannot invite as OWNER
    if (role === OrganizationMemberRole.OWNER) {
      throw new BadRequestException('Cannot invite member as OWNER role');
    }

    // Check if user is already a member (by email)
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      const existingMember = organization.members.find(
        (m) => m.userId.toString() === existingUser._id.toString(),
      );
      if (existingMember) {
        throw new ConflictException('User is already a member of this organization');
      }
    }

    // Check if there's a pending invitation for this email
    const existingInvitation = await this.invitationModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      email: email.toLowerCase(),
      status: InvitationStatus.PENDING,
    });

    if (existingInvitation) {
      throw new ConflictException('An invitation has already been sent to this email');
    }

    // Generate unique token
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

    // Create invitation
    const invitation = await this.invitationModel.create({
      organizationId: new Types.ObjectId(organizationId),
      email: email.toLowerCase(),
      token,
      role,
      storeAccess,
      invitedBy: new Types.ObjectId(userId),
      status: InvitationStatus.PENDING,
      expiresAt,
    });

    // Get inviter info
    const inviter = await this.userModel.findById(userId);
    const inviterName = inviter
      ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email
      : 'A team member';

    // Send invitation email
    try {
      await this.emailService.sendInvitationEmail({
        to: email,
        inviterName,
        organizationName: organization.name,
        role,
        inviteLink: `${process.env.FRONTEND_URL}/accept-invitation?token=${token}`,
        expiresAt,
      });
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${email}:`, error);
      // Don't fail the invitation if email fails - invitation still exists
    }

    return {
      message: `Invitation sent to ${email}`,
      invitation: {
        id: invitation._id.toString(),
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    };
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<any> {
    const invitation = await this.invitationModel.findOne({ token });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Invitation has already been ${invitation.status}`);
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = InvitationStatus.EXPIRED;
      await invitation.save();
      throw new BadRequestException('Invitation has expired');
    }

    const organization = await this.organizationModel.findById(invitation.organizationId);

    return {
      id: invitation._id.toString(),
      email: invitation.email,
      role: invitation.role,
      organizationName: organization?.name || 'Unknown',
      organizationId: invitation.organizationId.toString(),
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(token: string, userId: string): Promise<{ message: string; organizationId: string }> {
    const invitation = await this.invitationModel.findOne({ token });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Invitation has already been ${invitation.status}`);
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = InvitationStatus.EXPIRED;
      await invitation.save();
      throw new BadRequestException('Invitation has expired');
    }

    // Get the user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify email matches (case insensitive)
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address. Please log in with the correct account.',
      );
    }

    // Get organization
    const organization = await this.organizationModel.findOne({
      _id: invitation.organizationId,
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if already a member
    const existingMember = organization.members.find(
      (m) => m.userId.toString() === userId,
    );
    if (existingMember) {
      // Mark invitation as accepted anyway
      invitation.status = InvitationStatus.ACCEPTED;
      invitation.acceptedBy = new Types.ObjectId(userId) as any;
      invitation.acceptedAt = new Date();
      await invitation.save();
      throw new ConflictException('You are already a member of this organization');
    }

    // Add user to organization
    organization.members.push({
      userId: new Types.ObjectId(userId),
      role: invitation.role as OrganizationMemberRole,
      storeAccess: invitation.storeAccess,
      invitedAt: invitation.createdAt,
      acceptedAt: new Date(),
    } as any);

    await organization.save();

    // Mark invitation as accepted
    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedBy = new Types.ObjectId(userId) as any;
    invitation.acceptedAt = new Date();
    await invitation.save();

    return {
      message: `Successfully joined ${organization.name}`,
      organizationId: organization._id.toString(),
    };
  }

  /**
   * Get pending invitations for an organization
   */
  async getOrganizationInvitations(organizationId: string, userId: string): Promise<any[]> {
    const organization = await this.organizationModel.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!this.userHasAccess(organization, userId)) {
      throw new ForbiddenException('You do not have access to this organization');
    }

    const invitations = await this.invitationModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        status: InvitationStatus.PENDING,
      })
      .sort({ createdAt: -1 });

    return invitations.map((inv) => ({
      id: inv._id.toString(),
      email: inv.email,
      role: inv.role,
      storeAccess: inv.storeAccess,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));
  }

  /**
   * Revoke a pending invitation
   */
  async revokeInvitation(invitationId: string, userId: string): Promise<{ message: string }> {
    const invitation = await this.invitationModel.findById(invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const organization = await this.organizationModel.findOne({
      _id: invitation.organizationId,
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to revoke invitations');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot revoke invitation that is ${invitation.status}`);
    }

    invitation.status = InvitationStatus.REVOKED;
    await invitation.save();

    return { message: 'Invitation revoked successfully' };
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(invitationId: string, userId: string): Promise<{ message: string }> {
    const invitation = await this.invitationModel.findById(invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const organization = await this.organizationModel.findOne({
      _id: invitation.organizationId,
      isDeleted: false,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!this.userCanManage(organization, userId)) {
      throw new ForbiddenException('You do not have permission to resend invitations');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`Cannot resend invitation that is ${invitation.status}`);
    }

    // Update expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);
    invitation.expiresAt = expiresAt;
    await invitation.save();

    // Get inviter info
    const inviter = await this.userModel.findById(userId);
    const inviterName = inviter
      ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email
      : 'A team member';

    // Resend email
    try {
      await this.emailService.sendInvitationEmail({
        to: invitation.email,
        inviterName,
        organizationName: organization.name,
        role: invitation.role,
        inviteLink: `${process.env.FRONTEND_URL}/accept-invitation?token=${invitation.token}`,
        expiresAt,
      });
    } catch (error) {
      this.logger.error(`Failed to resend invitation email:`, error);
    }

    return { message: `Invitation resent to ${invitation.email}` };
  }

  /**
   * Get pending invitations for current user
   */
  async getUserPendingInvitations(userEmail: string): Promise<any[]> {
    const invitations = await this.invitationModel
      .find({
        email: userEmail.toLowerCase(),
        status: InvitationStatus.PENDING,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    const result = [];
    for (const inv of invitations) {
      const organization = await this.organizationModel.findById(inv.organizationId);
      result.push({
        id: inv._id.toString(),
        token: inv.token,
        role: inv.role,
        organizationId: inv.organizationId.toString(),
        organizationName: organization?.name || 'Unknown',
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      });
    }

    return result;
  }

  // Helper methods
  private generateToken(): string {
    return randomBytes(32).toString('hex');
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
}
