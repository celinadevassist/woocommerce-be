// Production Batch Status
export enum ProductionBatchStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  QC_PENDING = 'qc_pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Production Batch Type
export enum ProductionBatchType {
  STANDARD = 'standard',
  RUSH = 'rush',
  REWORK = 'rework',
  SAMPLE = 'sample',
}
