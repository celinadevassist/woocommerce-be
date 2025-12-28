import * as mongoose from 'mongoose';

const schema = new mongoose.Schema({
    creatorId: { type: mongoose.Schema.Types.ObjectId },
    userId: { type: mongoose.Schema.Types.ObjectId },
    serviceId: { type: mongoose.Schema.Types.ObjectId },
    onId: { type: mongoose.Schema.Types.ObjectId },
    type: { type: String },
    title: { type: mongoose.Schema.Types.Mixed },
    description: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date() },
}, {
    versionKey: false,
    autoIndex: true,
    collection: 'action-log',
});

export const ActionLogMongoSchema = schema;
