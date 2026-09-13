import { DOCUMENT_KINDS } from "../config/constants.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function getRequestTimeoutMs() {
  return Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS) || DEFAULT_REQUEST_TIMEOUT_MS;
}

const DOCUMENT_IMAGE_LABELS = {
  id_card: "ID CARD",
  ssn_card: "SSN CARD",
  selfie: "SELFIE",
};

// Read live from process.env on every call, never cached at module load: this is an optional
// operational feature (unlike Cloudinary/MongoDB), so config must be re-checkable per call
// without requiring a fresh module import, and the chat ID must always come from this env var
// rather than being hard-coded anywhere in business logic.
function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function getChatId() {
  return process.env.TELEGRAM_CHAT_ID;
}

function isConfigured() {
  return Boolean(getBotToken() && getChatId());
}

// Every error thrown from here is a plain, generic Error with only a safe machine-readable
// code and (for API errors) the HTTP status/Telegram error_code attached — never the bot token,
// the request URL, or the raw response/request body, any of which could otherwise end up in a
// log line via a caller's catch block.
async function callTelegramApi(method, { json, form } = {}) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_NOT_CONFIGURED");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getRequestTimeoutMs());

  let res;
  try {
    res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : form,
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "TELEGRAM_REQUEST_TIMEOUT" : "TELEGRAM_NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response body; handled as an error by the !payload?.ok check below.
  }

  if (!res.ok || !payload?.ok) {
    const err = new Error("TELEGRAM_API_ERROR");
    err.telegramHttpStatus = res.status;
    err.telegramErrorCode = payload?.error_code;
    throw err;
  }

  return payload.result;
}

async function sendMessage(text) {
  const chatId = getChatId();
  if (!chatId) throw new Error("TELEGRAM_NOT_CONFIGURED");
  return callTelegramApi("sendMessage", {
    json: { chat_id: chatId, text, disable_web_page_preview: true },
  });
}

async function sendPhoto({ buffer, filename, caption }) {
  const chatId = getChatId();
  if (!chatId) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([buffer], { type: "image/jpeg" }), filename);
  return callTelegramApi("sendPhoto", { form });
}

function formatMoney(decimal128Value) {
  // Decimal128's own string representation is used as-is (never round-tripped through
  // Number/toFixed) for the same reason utils/money.js stores amounts as Decimal128 in the
  // first place: to avoid floating-point rounding drift on monetary values.
  if (decimal128Value === undefined || decimal128Value === null) return "N/A";
  return decimal128Value.toString();
}

function formatDate(value) {
  if (!value) return "N/A";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toISOString().slice(0, 10);
}

function formatLine(label, value) {
  return `${label}: ${value === undefined || value === null || value === "" ? "N/A" : value}`;
}

const SECTION_RULE = "━".repeat(18); // "━━━━━━━━━━━━━━━━━━"

// Builds the Telegram-bound application summary directly from the saved application document,
// listing only fields that exist on the application schema. Deliberately excludes
// `disbursement`/`bankDetails` entirely (routing/account numbers are the most sensitive fields
// this API stores — see docs/applications-api.md) and every authentication-secret-shaped field
// (there are none on this schema, but none should ever be added here either). Sent as plain
// text with no parse_mode, so no Markdown/HTML escaping is needed or attempted.
export function buildApplicationSummaryText(doc) {
  const a = doc.applicant;
  const e = doc.employment;
  const l = doc.loanRequest;
  const history = doc.loanHistory || [];

  const lines = [
    "\u{1F6A8} NEW LOAN APPLICATION",
    "",
    SECTION_RULE,
    "APPLICATION",
    SECTION_RULE,
    formatLine("Application ID", doc.applicationId),
    formatLine("Submitted", formatDate(doc.metadata?.submittedAt)),
    "",
    SECTION_RULE,
    "APPLICANT",
    SECTION_RULE,
    formatLine("Name", `${a.firstName} ${a.lastName}`),
    formatLine("Phone", a.phoneNumber),
    formatLine("Email", a.email),
    formatLine("Date of Birth", formatDate(a.dateOfBirth)),
    formatLine("Address", `${a.residentialAddress}, ${a.city}, ${a.state}`),
    "",
    SECTION_RULE,
    "EMPLOYMENT",
    SECTION_RULE,
    formatLine("Status", e.employmentStatus),
    formatLine("Employer", e.employerName),
    formatLine("Occupation", e.jobTitle),
    formatLine(
      "Monthly Income",
      e.monthlyIncome != null ? `${formatMoney(e.monthlyIncome)}${e.incomeFrequency ? ` (${e.incomeFrequency})` : ""}` : undefined
    ),
    "",
    SECTION_RULE,
    "LOAN",
    SECTION_RULE,
    formatLine("Amount Requested", formatMoney(l.requestedLoanAmount)),
    formatLine("Purpose", l.loanPurpose),
    formatLine("Repayment Period", `${l.preferredRepaymentPeriodMonths} months (${l.repaymentFrequency})`),
    "",
    SECTION_RULE,
    "LOAN HISTORY",
    SECTION_RULE,
  ];

  if (history.length === 0) {
    lines.push(formatLine("Previous Loan", "None declared"));
  } else {
    const [mostRecent] = history;
    const suffix = history.length > 1 ? ` (+${history.length - 1} more)` : "";
    lines.push(
      formatLine("Previous Loan", `${mostRecent.lenderName}${suffix}`),
      formatLine("Previous Loan Amount", formatMoney(mostRecent.originalLoanAmount)),
      formatLine("Previous Loan Status", mostRecent.repaymentStatus),
      formatLine("Previous Loan Date", formatDate(mostRecent.startDate))
    );
  }

  lines.push(
    "",
    SECTION_RULE,
    "DOCUMENTS",
    SECTION_RULE,
    "\u{1FAAA} ID Card",
    "\u{1FAAA} SSN Card",
    "\u{1F933} Selfie",
    "",
    "Status: Submitted"
  );

  return lines.join("\n");
}

// `images` is a { [kind]: Buffer } map of the same processed (EXIF-stripped, re-encoded)
// buffers already uploaded to Cloudinary — never re-fetched from Cloudinary and never the
// original unprocessed upload. Sent in the fixed DOCUMENT_KINDS order (id_card, ssn_card,
// selfie) rather than an arbitrary object key order.
async function sendApplicationImages(applicationId, images) {
  for (const kind of DOCUMENT_KINDS) {
    const buffer = images[kind];
    if (!buffer) continue;
    const caption = `${DOCUMENT_IMAGE_LABELS[kind] || kind}\nApplication ID: ${applicationId}`;
    await sendPhoto({ buffer, filename: `${kind}.jpg`, caption });
  }
}

export const telegramNotifier = {
  isConfigured,
  sendMessage,
  sendPhoto,
  sendApplicationSummary: (doc) => sendMessage(buildApplicationSummaryText(doc)),
  sendApplicationImages,
};
