import mongoose, { connect } from 'mongoose';
import 'dotenv/config';

export * from './schema';

const mongoConnection = {
    isConnected: false
};

export const connectDb = async (uri?: string) => {
    if (mongoConnection.isConnected) {
        console.log('(mongodb) already connected');
        return;
    }
    if (mongoose.connections.length > 0) {
        mongoConnection.isConnected = Boolean(mongoose.connections[0].readyState);
        if (mongoConnection.isConnected) {
            console.log('(mongodb) already connected');
            return;
        }
        await mongoose.disconnect();
    }
    await mongoose.connect(uri ?? process.env.MONGODB_URI ?? 'mongodb://localhost');
    console.log('(mongodb) connected');
    mongoConnection.isConnected = true;
};
