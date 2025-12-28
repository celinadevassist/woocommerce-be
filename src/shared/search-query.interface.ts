import { Document } from 'mongoose';

export interface SearchQuery extends Document {
    searchTerm: string;
    endpoint: 'projects' | 'image-prompts' | 'sessions';
    resultCount?: number;
    userId?: string;
    metadata?: {
        userAgent?: string;
        ip?: string;
        language?: string;
    };
    createdAt: Date;
}
