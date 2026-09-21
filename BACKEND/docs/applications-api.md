# Loan Applications API

A small, focused API for receiving loan applications from the public website. There is no
applicant account system, no login, and no applicant-facing retrieval endpoint — see
[Security model](#security-model) for why.

Deployed as a Vercel Function alongside the static frontend (same origin — see the repository
root [`vercel.json`](../../vercel.json) and [`api/[...path].js`](../../api/[...path].js)).
Vercel Functions enforce a hard 4.5MB request body limit, well under the up to 24MB a submission's
three verification images could reach, so image bytes are never sent through this API directly —
see [Two-step image upload](#two-step-image-upload).

## Two-step image upload

The three verification images (ID card, SSN card, selfie) are uploaded **directly from the
browser to Cloudinary**, not through this API:

1. `POST /api/applications/uploads/init` returns a fresh `applicationId` and a signed upload
   target per image (a Cloudinary `public_id`, `timestamp`, and `signature` — never the
   Cloudinary API secret itself).
2. The browser uploads each image directly to Cloudinary using those signed parameters.
3. `POST /api/applications` (below) is called with that same `applicationId` plus the applicant
   data, as plain JSON — no file bytes in this request. The server fetches the three uploaded
   images back from Cloudinary itself, validates/re-encodes/strips metadata from each exactly as
   before, and only then persists the application and notifies Telegram.

An `applicationId` that was never obtained from step 1 (or for which the three images were never
actually uploaded) is rejected by step 3 with `VALIDATION_ERROR` — the server never trusts a
client-supplied `applicationId` on faith, it independently looks up what (if anything) was staged
under it.

## POST /api/applications/uploads/init

Issues an `applicationId` and one signed Cloudinary upload target per required document field
(`idCardImage`, `ssnCardImage`, `selfieImage`). Same rate limit as `POST /api/applications` below
(shared per-IP bucket, so a client can't bypass the limit by only ever calling this step).

### Success response — `201 Created`

```json
{
  "success": true,
  "applicationId": "LN-20260913-A7K4P9X",
  "uploads": {
    "idCardImage": {
      "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud_name>/image/upload",
      "cloudName": "...",
      "apiKey": "...",
      "timestamp": 1234567890,
      "signature": "...",
      "publicId": "loan-applications/LN-20260913-A7K4P9X/id_card-staging",
      "type": "authenticated"
    },
    "ssnCardImage": { "...": "..." },
    "selfieImage": { "...": "..." }
  }
}
```

`apiKey`/`signature` are safe to expose to the browser — the signature is computed server-side
with the Cloudinary API secret (which never leaves the server) and only authorizes uploading to
this exact `publicId`.

## POST /api/applications

Submit a new loan application, after the three images from the step above have already been
uploaded to Cloudinary. This is the only endpoint that actually creates an application record.

- **Auth:** none (public form submission)
- **Rate limit:** per-IP, configurable via `APPLICATION_RATE_LIMIT_MAX` /
  `APPLICATION_RATE_LIMIT_WINDOW_MS` (default: 10 requests / 15 minutes)
- **Max body size:** configurable via `MAX_REQUEST_BODY_SIZE` (default `25kb`) — this request
  carries applicant data only, never image bytes, so the default is unaffected by document size.
- **Idempotency:** optional `Idempotency-Key` request header (8–128 chars, `[A-Za-z0-9_-]`).
  Send the same key when retrying a submission (double-click, network retry) and the API
  returns the original result instead of creating a second application. Omit it, or use a
  new key, to submit a genuinely new application.

### Request body

All fields below are **applicant-supplied**. Any field not listed here — including `status`,
`creditScore`, `riskScore`, `interestRate`, `approvalStatus`, `adminNotes`, or any other
internal/decisioning field, at any nesting level — is rejected with `VALIDATION_ERROR`. The
request body is never stored as-is; the server reconstructs the record field by field from
validated input only.

```jsonc
{
  "applicationId": "the id returned by POST /api/applications/uploads/init, required",
  "applicant": {
    "firstName": "string, required, ≤80 chars",
    "lastName": "string, required, ≤80 chars",
    "email": "string, required, valid email, ≤254 chars",
    "phoneNumber": "string, required, digits/+/-/()/space, 7-20 chars",
    "dateOfBirth": "ISO date string, required, applicant must be 18-120 years old",
    "gender": "optional: male | female | other | prefer_not_to_say",
    "residentialAddress": "string, required, ≤250 chars",
    "city": "string, required, ≤100 chars",
    "state": "string, required, ≤100 chars"
  },
  "employment": {
    "employmentStatus": "required: employed | self_employed | unemployed | student | retired",
    "employerName": "string, required if employmentStatus is 'employed', ≤150 chars",
    "jobTitle": "optional, ≤100 chars",
    "employmentDurationMonths": "optional integer, 0-1200",
    "monthlyIncome": "required if employed/self_employed, positive number",
    "incomeFrequency": "required if employed/self_employed: weekly | biweekly | monthly | annually"
  },
  "loanRequest": {
    "requestedLoanAmount": "required, positive number, ≤ configured maximum",
    "loanPurpose": "string, required, ≤200 chars",
    "preferredRepaymentPeriodMonths": "required integer, 1-360",
    "repaymentFrequency": "required: weekly | biweekly | monthly | quarterly | annually"
  },
  "loanHistory": [
    {
      "lenderName": "string, required, ≤150 chars",
      "loanType": "optional, ≤100 chars",
      "originalLoanAmount": "required, positive number",
      "outstandingAmount": "optional, ≥0, ≤ originalLoanAmount",
      "repaymentStatus": "required: active | paid | overdue | defaulted | written_off",
      "startDate": "ISO date string, required",
      "endDate": "optional ISO date string, must be ≥ startDate",
      "repaymentFrequency": "optional: weekly | biweekly | monthly | quarterly | annually",
      "monthlyPayment": "optional, ≥0",
      "purpose": "optional, ≤200 chars"
    }
  ],
  "disbursement": {
    "preferredMethod": "required: check | direct_deposit | wire_transfer | ach | other",
    "otherMethodDetails": "string, required if preferredMethod is 'other', ≤200 chars",
    "bankDetails": {
      "accountHolderName": "string, required, ≤150 chars",
      "bankRoutingNumber": "required, 9 digits, must pass the ABA checksum",
      "accountNumber": "required, 4-17 digits",
      "accountType": "required: checking | savings",
      "bankType": "required: bank | credit_union | savings_and_loan | other"
    }
  },
  "consent": {
    "termsAccepted": "required, must be literal true",
    "dataProcessingAccepted": "required, must be literal true"
  }
}
```

`loanHistory` may be omitted or an empty array — not every applicant has previous borrowing
history. A maximum of 20 entries is accepted.

`disbursement.bankDetails` is always required, regardless of which `preferredMethod` is
chosen (including `check` and `other`).

### Server-generated / internal fields (not accepted from the client)

| Field | Set by |
|---|---|
| `applicationId` | server, issued by `POST /api/applications/uploads/init` (see [ID format](#application-id-format)) — the only public identifier for an application. The client echoes it back on `POST /api/applications`, but it is never trusted on faith: that request independently verifies the three required images were actually staged under it. |
| `status` | server, always `"submitted"` on creation; changed only by an internal process added later |
| `createdAt` / `updatedAt` | server (Mongoose timestamps) |
| `consent.acceptedAt` | server, current time at submission |
| `metadata.submittedAt`, `metadata.sourceIp`, `metadata.userAgent` | server, for audit/abuse investigation only — never returned in any response |
| `telegramNotification.status`/`lastAttemptAt`/`sentAt` | server, tracks the operational Telegram notification for this application (`pending`/`sent`/`failed`) — never returned in any response |

### Success response — `201 Created`

```json
{
  "success": true,
  "message": "Application submitted successfully.",
  "applicationId": "LN-20260913-A7K4P9X"
}
```

### Application ID format

`applicationId` is `LN-YYYYMMDD-XXXXXXX`: a fixed `LN` prefix, the UTC submission date, and a
7-character cryptographically random alphanumeric segment (`crypto.randomInt`, never
`Math.random()` — see [`utils/applicationId.js`](../src/utils/applicationId.js)). It carries no
applicant information (no name, DOB, phone, or other PII) and is always generated server-side —
a client cannot supply or influence it; the request schema above rejects any unrecognized field,
`applicationId` included. Uniqueness is enforced by a `unique` index on
`Application.applicationId` in MongoDB, independent of and in addition to MongoDB's own internal
`_id`, which remains the database's primary key and is never returned by this API.

Applications created before this format existed keep their original `crypto.randomUUID()`-style
`applicationId` (e.g. `1d6e6b0a-8f6e-4b9a-9c0d-3a2f6e6b0a8f`) — those values are never rewritten,
since Cloudinary's storage path for each application's documents is itself keyed by
`applicationId` (see `cloudinaryStorage.adapter.js`), so changing an existing application's ID
after the fact would orphan its already-uploaded documents. Both ID shapes are accepted
everywhere an `applicationId` is read from a request (e.g. the document retake endpoint below).

This is deliberately the entire response. The submitted applicant data, employment details,
loan history, and internal metadata are never echoed back.

### Error responses

All errors follow the same shape and never include stack traces, database errors, file paths,
or environment values:

```json
{
  "success": false,
  "message": "The submitted application data is invalid.",
  "code": "VALIDATION_ERROR",
  "errors": [{ "field": "applicant.email", "message": "email is invalid." }]
}
```

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Required field missing, wrong type/format, unknown field, invalid enum, amount out of range, malformed loan history, or one of the three required images was never uploaded under `applicationId` |
| 400 | `INVALID_IMAGE` | An uploaded image failed to decode, or is smaller than the minimum allowed dimensions |
| 400 | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` header present but not 8–128 chars of `[A-Za-z0-9_-]` |
| 400 | `MALFORMED_JSON` | Request body is not valid JSON |
| 403 | `CORS_NOT_ALLOWED` | Request's `Origin` is not in `ALLOWED_ORIGINS` |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds `MAX_REQUEST_BODY_SIZE`, or an uploaded image exceeds `MAX_DOCUMENT_UPLOAD_SIZE_BYTES` |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests from this IP in the configured window |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details are in server logs only, never in the response) |

## POST /api/applications/:applicationId/documents

Replaces one previously submitted verification image (e.g. a retake after a blurry capture) on
an application that already has all three. Same two-step shape as the endpoints above:

1. `POST /api/applications/:applicationId/documents/init` with JSON body `{ "kind": "id_card" |
   "ssn_card" | "selfie" }` returns a signed Cloudinary upload target for that one image.
2. The browser uploads directly to Cloudinary with it.
3. `POST /api/applications/:applicationId/documents` with the same JSON body confirms the
   upload — the server fetches it back from Cloudinary, processes it, and only then updates
   MongoDB. A fresh Cloudinary asset is used (the previous one is deleted only once the MongoDB
   write commits), so a failure at any step never leaves the application pointing at a
   half-replaced or missing document.

Rate limit: `DOCUMENT_UPLOAD_RATE_LIMIT_MAX` / `DOCUMENT_UPLOAD_RATE_LIMIT_WINDOW_MS`, shared
across both steps. Returns `404 APPLICATION_NOT_FOUND` for both a malformed and an
unknown-but-well-formed `applicationId` (no distinguishing signal either way).

## Security model

- **No retrieval endpoint.** There is no `GET /api/applications/:id` and no
  `GET /api/applications`. A public `applicationId` only ever proves *that a submission
  happened* — it grants no read access to applicant data. This is a deliberate design choice,
  not an oversight: a predictable-enough-to-guess-eventually public ID must never be the sole
  gate in front of personal/financial data (IDOR/BOLA). If the business later needs applicants
  or staff to look up an application, that requires a separate, properly authenticated/authorized
  mechanism — not a bare ID in a URL.
- **No public listing, admin, or debug endpoints.** Nothing under `/api` returns more than one
  applicant's data, and nothing enumerates applications.
- **Mass-assignment is blocked at two layers:** the zod schema (`.strict()` on every nested
  object) rejects unknown/internal fields outright, and the service layer builds the database
  document field-by-field from the validated DTO rather than saving the request body.
- **Status is always server-set.** The client cannot submit, and the schema cannot accept, a
  `status` field. Only a future authenticated internal endpoint may change it.
- **Monetary amounts are stored as MongoDB `Decimal128`**, never floating point.
- **Logging never includes applicant data.** Server logs carry only `requestId`,
  `applicationId`, event name, and error codes/names — never names, addresses, income,
  loan history content, bank/routing numbers, or raw driver error messages/stacks (which can
  embed submitted values).
- **Bank account/routing numbers are treated as the most sensitive fields this API stores.**
  `disbursement.bankDetails.accountNumber` and `bankRoutingNumber` are declared `select: false`
  on the Mongoose schema, so any future internal query must explicitly opt in to read them —
  they're excluded by default even from authorized internal tooling. They are validated
  (ABA routing-number checksum, digit-length checks) but never returned in any API response.
  If the business builds an internal review UI later, consider field-level encryption at rest
  for these two fields specifically, on top of the database's own encryption-at-rest.

## Operational Telegram notification

On a successful submission (after MongoDB persistence has already committed), the server sends
an application summary and the three verification images to a private, staff-only Telegram
channel — a notification channel only, not a storage or retrieval mechanism. This is entirely
internal/operational and has no effect on the request/response contract above:

- The summary includes every field documented above — applicant, employment, loan request, full
  loan history, disbursement method, and bank/routing/account details included — since this
  channel is the only place a submitted application is ever reviewed (there is no admin
  retrieval endpoint). Only infrastructure secrets (bot token, database connection string,
  Cloudinary API secret) are excluded, and none of those are ever fields on this schema.
- Images are sent as the same processed (EXIF-stripped, re-encoded) image bytes already uploaded
  to Cloudinary — never a Cloudinary URL, public ID, or other delivery detail, and never the raw
  unprocessed upload.
- If Telegram is unreachable or misconfigured, the application and its documents remain fully
  persisted regardless; the failure only affects `telegramNotification.status` (see above) and is
  logged without any applicant data, Telegram response body, or bot token.
- If `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are not set, this feature is disabled entirely and
  has no effect on submission behavior.
- Retaking a document (`POST /:applicationId/documents`) never triggers another full application
  notification.

See [`telegram.service.js`](../src/services/telegram.service.js) for the Telegram Bot API client.

## Environment variables

See [`.env.example`](../../.env.example) at the repository root.
