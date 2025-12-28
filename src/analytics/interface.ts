export interface IAnalyticsSummary {
  orders: {
    total: number;
    revenue: number;
    averageOrderValue: number;
    byStatus: Record<string, number>;
  };
  customers: {
    total: number;
    new: number;
    returning: number;
  };
  products: {
    total: number;
    lowStock: number;
    outOfStock: number;
  };
  reviews: {
    total: number;
    averageRating: number;
    pending: number;
  };
}

export interface IRevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export interface ITopProduct {
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  revenue: number;
}

export interface ITopCustomer {
  customerId: string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
}

export interface IOrdersByStatus {
  status: string;
  count: number;
}

export interface IRevenueByStore {
  storeId: string;
  storeName: string;
  revenue: number;
  orders: number;
}

export interface IDashboardAnalytics {
  summary: IAnalyticsSummary;
  revenueOverTime: IRevenueData[];
  topProducts: ITopProduct[];
  topCustomers: ITopCustomer[];
  ordersByStatus: IOrdersByStatus[];
  revenueByStore: IRevenueByStore[];
  recentOrders: any[];
  recentReviews: any[];
}

export interface IAnalyticsQuery {
  storeId?: string;
  startDate?: string;
  endDate?: string;
  period?: 'day' | 'week' | 'month' | 'year';
}
