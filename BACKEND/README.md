# Loan Application Backend

A small, focused Node.js/Express/MongoDB API that receives and securely stores loan
applications submitted from the public website. There is no applicant account system, no
login, and no payment or repayment processing — see
[docs/applications-api.md](docs/applications-api.md) for the full API reference and security
model.

## Features

- `POST /api/applications` — the only public endpoint
- Strict server-side validation (zod) — unknown/internal fields (status, credit score, admin
  notes, etc.) are always rejected, never stored
- No public retrieval, listing, admin, or debug endpoints — a public `applicationId` grants no
  read access to applicant data
- Per-IP rate limiting, request size limits, CORS allowlist, security headers (helmet)
- Idempotent retries via an optional `Idempotency-Key` header

## Prerequisites

- Node.js v22+
- A MongoDB connection string (local or Atlas)

## Installation

From the repository root:

```bash
npm install
```

Copy [`.env.example`](../.env.example) (at the repository root) to `.env` and fill in real
values.

## Running the Server

```bash
npm start        # production
npm run dev      # nodemon, auto-reload
npm test         # runs BACKEND/src/tests
```

## API Documentation

See [docs/applications-api.md](docs/applications-api.md).

## Technologies

- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **zod** - request validation/DTOs
- **helmet**, **cors**, **express-rate-limit** - security middleware

## Project Structure

```
src/
├── app.js                  Express app: security middleware, routing, error handling
├── index.js                Loads env, connects DB, starts the HTTP server
├── config/                 constants, database connection, CORS policy
├── models/                 Mongoose schemas (Application, IdempotencyKey)
├── validators/              zod request schemas (public input DTOs)
├── services/                business logic, never trusts the raw request body
├── controllers/             request/response glue
├── routes/                   route definitions
├── middleware/               requestId, rate limiting, 404/error handlers
├── utils/                    ApiError, asyncHandler, logger, money helpers
└── tests/                    node:test suites
```

## License

MIT
