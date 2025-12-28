import { OrganizationMemberRole } from './enum';

export interface IOrganizationMember {
  userId: string;
  role: OrganizationMemberRole;
  storeAccess: string[] | 'all';
  invitedAt: Date;
  acceptedAt?: Date;
}

export interface IOrganization {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  members: IOrganizationMember[];
  billingEmail?: string;
  storeCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationResponse {
  organizations: IOrganization[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}
