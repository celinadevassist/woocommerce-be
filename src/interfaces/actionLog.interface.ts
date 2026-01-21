import { Document } from 'mongoose';

export interface IActionLog extends Document {
  userId?: string;
  creatorId?: string;
  serviceId?: string;
  onId?: string;
  type?: string;
  title?: string;
  description?: string;
  createdAt?: Date;
}
