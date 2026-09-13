# Meridian Lending — Frontend

The public-facing loan application website: a marketing landing page and a multi-step
application form that submits to the existing [BACKEND](../BACKEND) API
(`POST /api/applications`). Built with React, TypeScript, Vite, and Tailwind CSS.

## Prerequisites

- Node.js v22+
- The backend running locally (see [../BACKEND/README.md](../BACKEND/README.md)), or a deployed
  backend URL

## Setup

```bash
npm install
cp .env.example .env   # already provided as .env.development for local dev
```

Set `VITE_API_BASE_URL` in `.env` (or `.env.local`) to the backend's base URL, including the
`/api` prefix — e.g. `http://localhost:5001/api`.

## Scripts

```bash
npm run dev          # start the dev server
npm run build        # type-check and build for production (no source maps)
npm run build:analyze # production build + writes dist/bundle-report.html
npm run preview      # preview the production build locally
npm run typecheck    # type-check without emitting
npm run lint         # lint the project
```

## Project structure

```
src/
├── api/            fetch client + typed request/response for POST /api/applications
├── components/
│   ├── apply/        form fields and controls used by the application wizard
│   ├── landing/       landing page sections
│   ├── layout/        navbar, footer, brand mark
│   └── ui/            generic UI primitives (alerts, spinner, ...)
├── hooks/           small reusable hooks (document title, ...)
├── lib/             constants, client-side validation, formatting helpers
└── pages/           routed pages (landing, apply wizard, 404)
    └── apply-steps/   one component per wizard step
```

## Notes

- Client-side validation in `src/lib/validation.ts` mirrors
  `BACKEND/src/validators/application.validator.js` for fast feedback, but the backend remains
  the sole source of truth — this file must be kept in sync manually if the backend schema
  changes.
- No source maps are generated in production builds (`vite.config.ts`).
- Telegram integration is intentionally out of scope for this frontend.
