import { Document } from 'mongoose';

export interface IImage extends Document {
  userId: string;
  serviceId: string;
  imageUrl: string;
  type: string;

  createdAt?: Date;
  updatedAt?: Date;
}
