export enum FieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  DROPDOWN = 'dropdown',
  IMAGE_SWATCH = 'image_swatch',
  COLOR_PICKER = 'color_picker',
  DATE_PICKER = 'date_picker',
  FILE_UPLOAD = 'file_upload',
}

export enum PriceModifierType {
  NONE = 'none',
  FLAT = 'flat',
  PERCENTAGE = 'percentage',
}

export enum FieldsetScope {
  PRODUCT = 'product',
  ORDER = 'order',
}

export enum FieldsetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum AssignmentType {
  PRODUCT = 'product',
  CATEGORY = 'category',
  TAG = 'tag',
  PRODUCT_TYPE = 'product_type',
  ATTRIBUTE = 'attribute',
  ALL = 'all',
}
