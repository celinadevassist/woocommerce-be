import {
  ReviewRequestStatus,
  ReviewRequestChannel,
  ReviewRequestTrigger,
} from './enum';

export interface IReviewRequestItem {
  productId?: string;
  productName: string;
  productSku?: string;
  productImage?: string;
  quantity: number;
  reviewed: boolean;
  reviewId?: string;
}

export interface IReviewRequest {
  _id: string;
  storeId: string;
  orderId: string;
  orderNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: IReviewRequestItem[];
  token: string;
  tokenExpiresAt: Date;
  status: ReviewRequestStatus;
  scheduledFor: Date;
  sentAt?: Date;
  sentVia?: ReviewRequestChannel;
  messageId?: string;
  openedAt?: Date;
  submittedAt?: Date;
  remindersSent: number;
  lastReminderAt?: Date;
  delayHours: number;
  expirationDays: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewRequestSettings {
  _id: string;
  storeId: string;
  enabled: boolean;
  triggerOn: ReviewRequestTrigger;
  delayHours: number;
  linkExpirationDays: number;
  channel: ReviewRequestChannel;
  sendReminders: boolean;
  reminderDelayDays: number;
  maxReminders: number;
  smsTemplate: string;
  reminderTemplate: string;
  excludeOrdersBelow?: number;
  onlyVerifiedCustomers: boolean;
  autoApproveReviews: boolean;
  autoApproveMinRating: number;
  autoPublishApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewRequestResponse {
  requests: IReviewRequest[];
  pagination: {
    total: number;
    page: number;
    size: number;
    pages: number;
  };
}

export interface IReviewRequestStats {
  total: number;
  pending: number;
  sent: number;
  opened: number;
  partial: number;
  completed: number;
  expired: number;
  conversionRate: number; // (partial + completed) / sent * 100
  openRate: number; // opened / sent * 100
}

// For public submission
export interface IPublicReviewRequest {
  storeName: string;
  storeUrl?: string;
  customerName: string;
  orderNumber: string;
  items: {
    productId?: string;
    productName: string;
    productImage?: string;
    quantity: number;
    reviewed: boolean;
  }[];
  expiresAt: Date;
}

export interface IReviewSubmission {
  productId?: string;
  rating: number;
  review: string;
  photos?: string[];
}
