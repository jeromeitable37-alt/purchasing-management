# Purchasing Management System V2

Vercel-ready purchasing workflow with Firestore, direct Google Sheets synchronization, automatic supplier evaluation emails, routing, deliveries, supplier management, OCR, reporting and a PO print layout modeled on the supplied Tropical Palms Fashion House purchase order.

## Core workflow

PRF / request → PO → delivery / receiving → automatic supplier evaluation email → public evaluation form → Firestore record → full spreadsheet reconciliation → routing/history update.

### Supplier evaluation

- Requisitioner / AMD: 4 criteria.
- Purchaser: 5 criteria including Compliance.
- Secure per-evaluation token.
- Automatic email when a PO reaches Delivered / Received / Completed and an evaluator email is configured.
- Manual resend with an enhanced email dialog.
- Submission is recorded in Firestore and triggers spreadsheet reconciliation.
- Historical spreadsheet rows can be seeded from the current Excel snapshots. After the baseline, synchronization is incremental: unchanged rows are fingerprinted and skipped, while new/changed evaluation, PRF and routing rows are reconciled.

### Google Sheets

No Apps Script is required by the V2 application. The server uses the Google Sheets API directly with a service account.

The service account must have Editor access to both spreadsheets:

- Supplier Evaluation / PO sheet: `1XjBq3f-zM8QUkgLPlDccbz9c1Jy8L0JTJUOrZ0skfHA`
- Routing / PRF v2: `1h4OvmGWLzhUf2A9xk8uOmeVQgrKV1Xug42n9LH77Avw`

The `/api/sync` endpoint performs a full reconciliation:

1. Imports all existing supplier-evaluation rows into Firestore.
2. Imports all existing routing rows into Firestore.
3. Exports Firestore evaluation data back to the supplier sheet.
4. Exports Firestore routing data back to the routing sheet.
5. Uses stable system IDs when available and alias-aware column matching.

### Purchase order document

The New PO form supports multiple line items, supplier information, PRF, requisitioner, purpose, terms, approval fields, discount, delivery dates and evaluator email.

`Print PO` opens a single-page print layout matching the structure of the supplied PO: header block, supplier section, PO/date/delivery/terms block, QTY/UNIT/PARTICULARS/UNIT PRICE/TOTAL AMOUNT table, requisitioner/PRF/purpose block, total in words, notes and three signature areas.

Browser Print / Save PDF is used so the rendered document can be saved as PDF without a separate Apps Script process.

## Setup

```bash
npm install
npm run dev
```

Set the variables in `.env.example` in Vercel. Do not commit `.env.local` or private keys.

## Email

Automatic evaluation email uses Resend. Configure:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NEXT_PUBLIC_APP_URL`

Without Resend, evaluation records and secure links are still created and the UI shows the generated link.

## Security

Rotate any Firebase Admin or other service-account key that may have been exposed in an uploaded archive. Keep all private keys in Vercel environment variables or a local ignored `.env.local` file.


## Baseline Excel import

Use the Sync Center to upload the current `_PURCHASING SUPPLIER EVALUATION (1).xlsx` and `V2 - PRF AND SRF ONLINE MONITORING .xlsx` snapshots once. The importer reads historical supplier-evaluation data plus the `PRF - SISC` / `SRF - SISC` monitoring sheets, creates route history, and records source fingerprints. Later `/api/sync` runs process only changed/new rows.

## Firestore quota-safe sync

The sync layer uses sheet fingerprints stored in `syncMeta` so unchanged source sheets do not trigger repeated full Firestore collection reads. Application edits to evaluations, PRF details, and routes set `needsExport=true`; the sync export queries only those dirty documents. Evaluation submission no longer launches a full `/api/sync` request. The browser pauses automatic sync temporarily after a Firestore `RESOURCE_EXHAUSTED` response.

If the Firebase project has already exhausted its daily Firestore quota, wait for the quota reset or enable billing before testing the first full reconciliation.
