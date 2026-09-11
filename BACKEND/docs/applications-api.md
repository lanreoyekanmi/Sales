# Loan Applications API

A small, focused API for receiving loan applications from the public website. There is no
applicant account system, no login, and no applicant-facing retrieval endpoint — see
[Security model](#security-model) for why.

## POST /api/applications

Submit a new loan application. This is the only public endpoint on this resource.

- **Auth:** none (public form submission)
- **Rate limit:** per-IP, configurable via `APPLICATION_RATE_LIMIT_MAX` /
  `APPLICATION_RATE_LIMIT_WINDOW_MS` (default: 10 requests / 15 minutes)
- **Max body size:** configurable via `MAX_REQUEST_BODY_SIZE` (default `25kb`)
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
| `applicationId` | server, `crypto.randomUUID()` — the only public identifier for an application |
| `status` | server, always `"submitted"` on creation; changed only by an internal process added later |
| `createdAt` / `updatedAt` | server (Mongoose timestamps) |
| `consent.acceptedAt` | server, current time at submission |
| `metadata.submittedAt`, `metadata.sourceIp`, `metadata.userAgent` | server, for audit/abuse investigation only — never returned in any response |

### Success response — `201 Created`

```json
{
  "success": true,
  "message": "Application submitted successfully.",
  "applicationId": "1d6e6b0a-8f6e-4b9a-9c0d-3a2f6e6b0a8f"
}
```

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
| 400 | `VALIDATION_ERROR` | Required field missing, wrong type/format, unknown field, invalid enum, amount out of range, malformed loan history |
| 400 | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` header present but not 8–128 chars of `[A-Za-z0-9_-]` |
| 400 | `MALFORMED_JSON` | Request body is not valid JSON |
| 403 | `CORS_NOT_ALLOWED` | Request's `Origin` is not in `ALLOWED_ORIGINS` |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds `MAX_REQUEST_BODY_SIZE` |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests from this IP in the configured window |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details are in server logs only, never in the response) |

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

## Environment variables

See [`.env.example`](../../.env.example) at the repository root.
