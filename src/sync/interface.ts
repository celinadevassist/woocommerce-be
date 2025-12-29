import { SyncJobType, SyncJobStatus, SyncEntityType, SyncMode } from './enum';

export interface ISyncJob {
  _id: string;
  storeId: string;
  entityType: SyncEntityType;
  type: SyncJobType;
  status: SyncJobStatus;
  syncMode: SyncMode;
  modifiedAfter?: Date;
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
  fellBackToFull?: boolean; // True when delta sync fell back to full due to no previous lastSync
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
