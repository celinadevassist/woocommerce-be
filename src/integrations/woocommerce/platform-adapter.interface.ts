// Platform adapter interface for future multi-platform support (Shopify, etc.)

export interface IConnectionTestResult {
  success: boolean;
  message: string;
  storeInfo?: {
    name: string;
    url: string;
    version: string;
    currency: string;
    timezone: string;
  };
}

export interface IPlatformCredentials {
  url: string;
  [key: string]: any;
}

export interface IPaginatedResult<T> {
  data: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export interface IPlatformAdapter {
  /**
   * Test connection to the e-commerce platform
   */
  testConnection(credentials: IPlatformCredentials): Promise<IConnectionTestResult>;

  /**
   * Get products with pagination
   */
  getProducts(
    credentials: IPlatformCredentials,
    page: number,
    perPage: number,
  ): Promise<IPaginatedResult<any>>;

  /**
   * Get a single product by external ID
   */
  getProduct(credentials: IPlatformCredentials, externalId: number): Promise<any>;

  /**
   * Update a product on the platform
   */
  updateProduct(credentials: IPlatformCredentials, externalId: number, data: any): Promise<any>;

  /**
   * Update product stock
   */
  updateStock(
    credentials: IPlatformCredentials,
    externalId: number,
    quantity: number,
  ): Promise<any>;

  /**
   * Get orders with pagination
   */
  getOrders(
    credentials: IPlatformCredentials,
    page: number,
    perPage: number,
    status?: string,
  ): Promise<IPaginatedResult<any>>;

  /**
   * Get customers with pagination
   */
  getCustomers(
    credentials: IPlatformCredentials,
    page: number,
    perPage: number,
  ): Promise<IPaginatedResult<any>>;

  /**
   * Get product reviews with pagination
   */
  getReviews(
    credentials: IPlatformCredentials,
    page: number,
    perPage: number,
  ): Promise<IPaginatedResult<any>>;
}
