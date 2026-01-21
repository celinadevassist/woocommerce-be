export enum MaterialUnit {
  PIECE = 'piece',
  METER = 'meter',
  KG = 'kg',
  GRAM = 'gram',
  LITER = 'liter',
  ML = 'ml',
  BOX = 'box',
  ROLL = 'roll',
}

export enum MaterialTransactionType {
  ADD = 'ADD',
  DEDUCT = 'DEDUCT',
  ADJUST = 'ADJUST',
  WASTE = 'WASTE',
}

export enum MaterialTransactionReferenceType {
  PURCHASE = 'PURCHASE',
  PRODUCTION = 'PRODUCTION',
  MANUAL = 'MANUAL',
  WASTE = 'WASTE',
}
