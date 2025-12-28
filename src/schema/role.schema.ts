import * as mongoose from 'mongoose';

const schema = new mongoose.Schema({
    name: { type: String },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date },
    creator: { type: mongoose.Schema.Types.ObjectId },
    scopes: { type: [String] },
}, {
    versionKey: false,
    collection: 'roles',
}).index({ name: 'text' });

export const RolesMongoSchema = schema;
