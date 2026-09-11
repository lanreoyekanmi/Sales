import { randomUUID } from "node:crypto";

// A caller-supplied X-Request-Id is only used for log correlation, never trusted as an
// identifier for any lookup, so arbitrary client input here carries no security risk.
export default function requestId(req, res, next) {
  req.requestId = req.headers["x-request-id"] || randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
}
