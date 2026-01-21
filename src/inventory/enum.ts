export enum InventoryChangeType {
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  SYNC_FROM_WOO = 'sync_from_woo',
  PUSH_TO_WOO = 'push_to_woo',
  ORDER_PLACED = 'order_placed',
  ORDER_CANCELLED = 'order_cancelled',
  ORDER_REFUNDED = 'order_refunded',
  RESTOCK = 'restock',
  DAMAGE = 'damage',
  RETURN = 'return',
  INITIAL_STOCK = 'initial_stock',
}

export enum AlertType {
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  BACK_IN_STOCK = 'back_in_stock',
}

export enum AlertStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}
