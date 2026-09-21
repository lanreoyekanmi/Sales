import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";

// Cached at module scope so a warm Vercel Function invocation reuses the existing connection
// instead of opening a new one on every request — a fresh module import only happens on a cold
// start. Local dev (index.js, called once at process startup) benefits the same way. On
// failure, the cached promise is cleared so the next invocation/request gets a fresh attempt
// instead of permanently reusing a rejected promise.
let connectionPromise;

const connectDB = () => {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGO_URI, { dbName: DB_NAME })
      .then((instance) => {
        console.log(`MongoDB Connected:\n           ${instance.connection.host}`);
        return instance.connection;
      })
      .catch((error) => {
        connectionPromise = undefined;
        throw error;
      });
  }

  return connectionPromise;
};

export default connectDB;
