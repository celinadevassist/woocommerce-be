import * as mongoose from 'mongoose';

const schema = new mongoose.Schema({
    type: { type: String }, //profile - store

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },

    imageUrl: { type: String },

    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
}, {
    versionKey: false,
    collection: 'image',
});

export const ImageMongoSchema = schema;
