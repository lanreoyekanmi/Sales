import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "./config/cors.js";
import requestId from "./middleware/requestId.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

const app = express();

app.disable("x-powered-by");

// Only trust X-Forwarded-* headers when explicitly configured for the deployment's actual
// reverse-proxy setup; trusting it unconditionally would let clients spoof req.ip and bypass
// IP-based rate limiting.
if (process.env.TRUST_PROXY) {
  const value = process.env.TRUST_PROXY;
  app.set("trust proxy", value === "true" ? true : Number.isNaN(Number(value)) ? value : Number(value));
}

app.use(requestId);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.MAX_REQUEST_BODY_SIZE || "25kb" }));

app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;