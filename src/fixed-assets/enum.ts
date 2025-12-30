export enum AssetCategory {
  PRINTER = 'printer',
  COMPUTER = 'computer',
  MACHINE = 'machine',
  FURNITURE = 'furniture',
  VEHICLE = 'vehicle',
  TOOLS = 'tools',
  OTHER = 'other',
}

export enum AssetStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
  DISPOSED = 'disposed',
}

export enum MaintenanceType {
  MAINTENANCE = 'maintenance',
  REPAIR = 'repair',
  UPGRADE = 'upgrade',
  INSPECTION = 'inspection',
}

export enum DepreciationMethod {
  STRAIGHT_LINE = 'straight_line',
  DECLINING_BALANCE = 'declining_balance',
  NONE = 'none',
}
