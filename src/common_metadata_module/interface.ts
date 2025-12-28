import { Types, Schema } from 'mongoose';
import { ModuleType } from './enum';

export interface IMetadata {
  _id?: string;
  userId: Types.ObjectId | Schema.Types.ObjectId | string;
  forModule: ModuleType;
  meta: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
} 