import { Types } from 'mongoose';
import { CostType, CostCategory } from './enum';

export interface ICostTemplate {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  name: string;
  description?: string;
  type: CostType;
  category: CostCategory;
  defaultAmount: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICostEntry {
  _id: Types.ObjectId;
  storeId: Types.ObjectId;
  templateId?: Types.ObjectId;
  name: string;
  type: CostType;
  category: CostCategory;
  month: string; // Format: 'YYYY-MM'
  amount: number;
  paidAt?: Date;
  notes?: string;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMonthlySummary {
  month: string;
  total: number;
  fixed: number;
  variable: number;
  byCategory: Record<string, number>;
  entryCount: number;
}

export interface ICostSummary {
  currentMonth: IMonthlySummary;
  previousMonth?: IMonthlySummary;
  percentChange: number;
  avgMonthly: number;
  totalYTD: number;
}

export interface ICostTemplateResponse {
  templates: ICostTemplate[];
  total: number;
}

export interface ICostEntryResponse {
  entries: ICostEntry[];
  total: number;
  page: number;
  pages: number;
  summary: IMonthlySummary;
}
