import dotenv from "dotenv";

// Side-effect-only module, imported first (and only) for its ordering guarantee: ES module
// imports are hoisted and evaluated before any of the importing file's own top-level code, so
// a plain `dotenv.config()` call inside index.js itself would run too late — after app.js's
// entire import graph (including config/cloudinary.js, which reads process.env at import
// time and fails fast if it's missing) has already been evaluated with an empty environment.
// Importing this module first guarantees env vars are loaded before any sibling import's
// module graph is evaluated.
dotenv.config({ path: ".env" });
