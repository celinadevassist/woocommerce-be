export interface ICategory {
  _id: string;
  storeId: string;
  organizationId: string;
  externalId: number;
  name: string;
  slug: string;
  parentId: string | null;
  parentExternalId: number | null;
  description: string;
  display: string;
  image: {
    id: number;
    src: string;
    name: string;
    alt: string;
  } | null;
  menuOrder: number;
  count: number;
  lastSyncedAt?: Date;
  pendingSync: boolean;
  createdAt: Date;
  updatedAt: Date;
  children?: ICategory[]; // For hierarchical tree view
}

export interface ICategoryResponse {
  categories: ICategory[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface ICategoryTree extends ICategory {
  children: ICategoryTree[];
}
