// Stock Transaction Types
export enum StockTransactionType {
  PRODUCTION = 'production',      // From completed production batch
  SALE = 'sale',                  // Sold (from order)
  RETURN = 'return',              // Customer return
  ADJUSTMENT = 'adjustment',      // Manual adjustment
  TRANSFER_IN = 'transfer_in',    // Transfer from another location
  TRANSFER_OUT = 'transfer_out',  // Transfer to another location
  DAMAGE = 'damage',              // Damaged/written off
  INITIAL = 'initial',            // Initial stock setup
}

// Stock Status
export enum StockStatus {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
}
