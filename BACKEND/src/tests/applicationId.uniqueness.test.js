import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { generateApplicationId } from "../utils/applicationId.js";

dotenv.config({ path: ".env" });

// Isolated database, own to this file — never the app's real "Sales" database, and distinct
// from other test files' databases so their document counts never race with this one's writes.
const TEST_DB_NAME = "Sales_test_applicationId_uniqueness";

let Application;

function minimalApplicationData(applicationId) {
  return {
    applicationId,
    applicant: {
      firstName: "Jane",
      lastName: "Doe",
      email: `jane+${randomUUID()}@example.com`,
      phoneNumber: "+1 555-123-4567",
      dateOfBirth: new Date("1990-01-01"),
      residentialAddress: "123 Main St",
      city: "Springfield",
      state: "IL",
    },
    employment: { employmentStatus: "unemployed" },
    loanRequest: {
      requestedLoanAmount: 1000,
      loanPurpose: "test",
      preferredRepaymentPeriodMonths: 12,
      repaymentFrequency: "monthly",
    },
    disbursement: {
      preferredMethod: "direct_deposit",
      bankDetails: {
        accountHolderName: "Jane Doe",
        bankRoutingNumber: "011401533",
        accountNumber: "1234567890",
        accountType: "checking",
        bankType: "bank",
      },
    },
    // The `documents` array's own schema validator requires exactly one entry per required
    // kind — irrelevant to what this file tests, but still needed to get past `.save()`.
    documents: ["id_card", "ssn_card", "selfie"].map((kind) => ({
      kind,
      publicId: `test/${applicationId}/${kind}`,
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      bytes: 100,
    })),
    consent: { termsAccepted: true, dataProcessingAccepted: true },
    metadata: {},
  };
}

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be set (see .env.example) to run applicationId.uniqueness.test.js");
  }
  await mongoose.connect(process.env.MONGO_URI, { dbName: TEST_DB_NAME });
  ({ default: Application } = await import("../models/application.model.js"));
  // Mongoose builds indexes in the background by default; wait for them explicitly so the
  // `unique` index on applicationId is actually enforced before the assertions below run.
  await Application.init();
});

after(async () => {
  await Application.deleteMany({});
  await mongoose.disconnect();
});

test("MongoDB rejects a second application with a duplicate applicationId (new format)", async () => {
  const duplicateId = generateApplicationId();
  await new Application(minimalApplicationData(duplicateId)).save();

  await assert.rejects(
    new Application(minimalApplicationData(duplicateId)).save(),
    (err) => {
      assert.equal(err.code, 11000, "expected a MongoDB duplicate-key error");
      return true;
    }
  );

  const count = await Application.countDocuments({ applicationId: duplicateId });
  assert.equal(count, 1, "only the first document should have been persisted");
});

test("MongoDB rejects a duplicate legacy UUID-format applicationId just as strictly", async () => {
  const duplicateId = randomUUID();
  await new Application(minimalApplicationData(duplicateId)).save();

  await assert.rejects(
    new Application(minimalApplicationData(duplicateId)).save(),
    (err) => {
      assert.equal(err.code, 11000);
      return true;
    }
  );
});

test("MongoDB's internal _id remains independent of and distinct from the public applicationId", async () => {
  const applicationId = generateApplicationId();
  const doc = await new Application(minimalApplicationData(applicationId)).save();

  assert.ok(mongoose.isValidObjectId(doc._id), "_id should be a normal MongoDB ObjectId");
  assert.notEqual(doc._id.toString(), doc.applicationId);

  const serialized = doc.toJSON();
  assert.equal(serialized._id, undefined, "_id must never be exposed via toJSON");
  assert.equal(serialized.applicationId, applicationId);
});
