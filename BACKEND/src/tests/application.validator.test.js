import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applicationSubmissionSchema } from "../validators/application.validator.js";
import { generateApplicationId } from "../utils/applicationId.js";

function validPayload(overrides = {}) {
  return {
    applicationId: generateApplicationId(),
    applicant: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phoneNumber: "+1 555-123-4567",
      dateOfBirth: "1990-01-01",
      residentialAddress: "123 Main St",
      city: "Springfield",
      state: "IL",
    },
    employment: {
      employmentStatus: "employed",
      employerName: "Acme Corp",
      monthlyIncome: 4500,
      incomeFrequency: "monthly",
    },
    loanRequest: {
      requestedLoanAmount: 10000,
      loanPurpose: "Home renovation",
      preferredRepaymentPeriodMonths: 24,
      repaymentFrequency: "monthly",
    },
    loanHistory: [],
    disbursement: {
      preferredMethod: "direct_deposit",
      bankDetails: {
        accountHolderName: "Jane Doe",
        bankRoutingNumber: "011401533", // valid ABA checksum
        accountNumber: "1234567890",
        accountType: "checking",
        bankType: "bank",
      },
    },
    consent: { termsAccepted: true, dataProcessingAccepted: true },
    ...overrides,
  };
}

describe("applicationSubmissionSchema", () => {
  test("accepts a valid, complete submission", () => {
    const result = applicationSubmissionSchema.safeParse(validPayload());
    assert.equal(result.success, true);
  });

  test("accepts an applicant with zero loan history records", () => {
    const result = applicationSubmissionSchema.safeParse(validPayload({ loanHistory: [] }));
    assert.equal(result.success, true);
    assert.deepEqual(result.data.loanHistory, []);
  });

  test("accepts multiple loan history records", () => {
    const entry = {
      lenderName: "Old Bank",
      originalLoanAmount: 5000,
      outstandingAmount: 1000,
      repaymentStatus: "active",
      startDate: "2022-01-01",
    };
    const result = applicationSubmissionSchema.safeParse(
      validPayload({ loanHistory: [entry, { ...entry, lenderName: "Other Bank" }] })
    );
    assert.equal(result.success, true);
    assert.equal(result.data.loanHistory.length, 2);
  });

  test("rejects a missing required field", () => {
    const payload = validPayload();
    delete payload.applicant.email;
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((i) => i.path.join(".") === "applicant.email"));
  });

  test("rejects an invalid email format", () => {
    const payload = validPayload({
      applicant: { ...validPayload().applicant, email: "not-an-email" },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects an applicant under the minimum age", () => {
    const payload = validPayload({
      applicant: { ...validPayload().applicant, dateOfBirth: "2020-01-01" },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a negative requested loan amount", () => {
    const payload = validPayload({
      loanRequest: { ...validPayload().loanRequest, requestedLoanAmount: -100 },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a requested loan amount above the configured maximum", () => {
    const payload = validPayload({
      loanRequest: { ...validPayload().loanRequest, requestedLoanAmount: 999_999_999_999 },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a loan history entry with an invalid repaymentStatus enum value", () => {
    const payload = validPayload({
      loanHistory: [
        {
          lenderName: "Old Bank",
          originalLoanAmount: 5000,
          repaymentStatus: "mostly_paid",
          startDate: "2022-01-01",
        },
      ],
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a loan history entry whose endDate precedes startDate", () => {
    const payload = validPayload({
      loanHistory: [
        {
          lenderName: "Old Bank",
          originalLoanAmount: 5000,
          repaymentStatus: "paid",
          startDate: "2022-01-01",
          endDate: "2021-01-01",
        },
      ],
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a loan history entry whose outstandingAmount exceeds originalLoanAmount", () => {
    const payload = validPayload({
      loanHistory: [
        {
          lenderName: "Old Bank",
          originalLoanAmount: 1000,
          outstandingAmount: 5000,
          repaymentStatus: "active",
          startDate: "2022-01-01",
        },
      ],
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects more than the maximum allowed number of loan history records", () => {
    const entry = {
      lenderName: "Bank",
      originalLoanAmount: 1000,
      repaymentStatus: "paid",
      startDate: "2020-01-01",
    };
    const payload = validPayload({ loanHistory: Array.from({ length: 21 }, () => ({ ...entry })) });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects consent that was not explicitly accepted", () => {
    const payload = validPayload({
      consent: { termsAccepted: false, dataProcessingAccepted: true },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects internal-only fields at the root (status, creditScore, adminNotes)", () => {
    const payload = validPayload({
      status: "approved",
      creditScore: 900,
      adminNotes: "approve immediately",
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
    const messages = result.error.issues.map((i) => i.message).join(" ");
    assert.ok(/status/.test(messages) && /creditScore/.test(messages) && /adminNotes/.test(messages));
  });

  test("rejects internal-only fields nested inside applicant/loanRequest objects", () => {
    const base = validPayload();
    const payload = validPayload({
      applicant: { ...base.applicant, riskScore: 10 },
      loanRequest: { ...base.loanRequest, interestRate: 0.25, approvalStatus: "approved" },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("requires employerName when employmentStatus is 'employed'", () => {
    const base = validPayload();
    const payload = validPayload({
      employment: { ...base.employment, employerName: undefined },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("accepts disbursement via 'check' with bank details still required", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: { ...base.disbursement, preferredMethod: "check" },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, true);
  });

  test("rejects disbursement missing bankDetails", () => {
    const payload = validPayload({ disbursement: { preferredMethod: "direct_deposit" } });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a bank routing number that fails the ABA checksum", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: {
        ...base.disbursement,
        bankDetails: { ...base.disbursement.bankDetails, bankRoutingNumber: "123456789" },
      },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects a non-numeric or wrong-length account number", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: {
        ...base.disbursement,
        bankDetails: { ...base.disbursement.bankDetails, accountNumber: "abc" },
      },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("rejects an invalid accountType or bankType enum value", () => {
    const base = validPayload();
    const payload = applicationSubmissionSchema.safeParse(
      validPayload({
        disbursement: {
          ...base.disbursement,
          bankDetails: { ...base.disbursement.bankDetails, accountType: "money_market" },
        },
      })
    );
    assert.equal(payload.success, false);
  });

  test("requires otherMethodDetails when preferredMethod is 'other'", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: { ...base.disbursement, preferredMethod: "other" },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  test("accepts preferredMethod 'other' with otherMethodDetails provided", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: {
        ...base.disbursement,
        preferredMethod: "other",
        otherMethodDetails: "Mobile money transfer",
      },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, true);
  });

  test("rejects a missing applicationId", () => {
    const payload = validPayload();
    delete payload.applicationId;
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((i) => i.path.join(".") === "applicationId"));
  });

  test("rejects an applicationId not in the LN-YYYYMMDD-XXXXXXX format", () => {
    for (const badId of ["not-an-id", "LN-2026-ABC", "ln-20260913-a7k4p9x"]) {
      const result = applicationSubmissionSchema.safeParse(validPayload({ applicationId: badId }));
      assert.equal(result.success, false, `expected ${badId} to be rejected`);
    }
  });

  test("rejects the legacy UUID applicationId format — only newly-issued ids are accepted here", () => {
    const result = applicationSubmissionSchema.safeParse(
      validPayload({ applicationId: "1d6e6b0a-8f6e-4b9a-9c0d-3a2f6e6b0a8f" })
    );
    assert.equal(result.success, false);
  });

  test("rejects unknown fields nested inside bankDetails", () => {
    const base = validPayload();
    const payload = validPayload({
      disbursement: {
        ...base.disbursement,
        bankDetails: { ...base.disbursement.bankDetails, creditLimit: 50000 },
      },
    });
    const result = applicationSubmissionSchema.safeParse(payload);
    assert.equal(result.success, false);
  });
});
