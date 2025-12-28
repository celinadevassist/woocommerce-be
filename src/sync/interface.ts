import { SyncJobType, SyncJobStatus, SyncEntityType } from './enum';

export interface ISyncJob {
  _id: string;
  storeId: string;
  organizationId: string;
  entityType: SyncEntityType;
  type: SyncJobType;
  status: SyncJobStatus;
  totalItems: number;
  processedItems: number;
  createdItems: number;
  updatedItems: number;
  skippedItems: number;
  failedItems: number;
  currentPage: number;
  totalPages: number;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  error?: string;
  errors: string[];
  triggeredBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISyncProgress {
  jobId: string;
  status: SyncJobStatus;
  entityType: SyncEntityType;
  totalItems: number;
  processedItems: number;
  percentage: number;
  currentPage: number;
  totalPages: number;
  createdItems: number;
  updatedItems: number;
  skippedItems: number;
  failedItems: number;
  startedAt?: Date;
  estimatedTimeRemaining?: number; // in seconds
}

export interface ISyncResult {
  success: boolean;
  message: string;
  job?: ISyncJob;
}

export interface ISyncJobsResponse {
  jobs: ISyncJob[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}
