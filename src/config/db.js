import mongoose from 'mongoose';

let cachedPromise = null;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        dbName: process.env.DB_NAME || 'pizzahub',
      })
      .then((conn) => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
      })
      .catch((error) => {
        cachedPromise = null;
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        if (process.env.VERCEL !== '1') {
          process.exit(1);
        }
        throw error;
      });
  }
  return cachedPromise;
};
