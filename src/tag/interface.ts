export interface ITag {
  _id: string;
  storeId: string;
  externalId: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  lastSyncedAt?: Date;
  pendingSync: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITagResponse {
  tags: ITag[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}
