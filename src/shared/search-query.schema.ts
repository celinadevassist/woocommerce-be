import * as mongoose from 'mongoose';

const schema = new mongoose.Schema({
    searchTerm: {
        type: String,
        required: true,
        index: true
    },
    endpoint: {
        type: String,
        required: true,
        index: true,
        // No enum restriction - allows any module to track searches
        // Common values: 'projects', 'image-prompts', 'sessions', 'articles', 'questions', 'tools', 'quotes', etc.
    },
    resultCount: {
        type: Number,
        default: 0
    },
    userId: {
        type: String,
        required: false
    },
    metadata: {
        userAgent: { type: String },
        ip: { type: String },
        language: { type: String }
    },
    createdAt: { type: Date, default: () => new Date() }
}, {
    versionKey: false,
    autoIndex: true,
    collection: 'searchQueries'
});

// Indexes for analytics and performance
schema.index({ searchTerm: 1, createdAt: -1 });
schema.index({ endpoint: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
// Index for IP-based deduplication: check if same IP searched same term recently
schema.index({ searchTerm: 1, 'metadata.ip': 1, endpoint: 1, createdAt: -1 });

export const SearchQuerySchema = schema;
