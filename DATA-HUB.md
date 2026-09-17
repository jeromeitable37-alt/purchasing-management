# Spreadsheet Data Hub

The new Spreadsheet Data Hub is the recommended way to verify source data without loading the entire workbook into Firestore.

## Sources
- Supplier Evaluation workbook: `SUPPLIER_SHEET_ID`
- V2 PRF/SRF Monitoring workbook: `ROUTING_SHEET_ID`

## Why this exists
The connected workbooks contain a lot of historical data. The app should not need to copy every historical row into Firestore just so the user can see whether it exists. The Data Hub reads the selected Google Sheet tab directly and shows a lightweight preview.

## Current uploaded baseline inventory
The supplied V2 workbook contains 31 tabs and 7,002 non-empty PRF/SRF monitoring rows across its PRF/SRF entity tabs. It also contains `Name of Purchasers` and supporting lists.

The supplied Supplier Evaluation workbook contains 28 tabs, including `DATABASE`, `PRF Details`, `PRF Details v2`, `PO for Evaluation`, `Supplier Lists`, and requisitioner-detail tabs.

## Recommended source-of-truth split
- Google Sheets: historical/source records and monitoring workbooks.
- Firestore: live transactional data, active workflows, app-created PO/evaluation/route changes, user access, and route history.
- Data Hub: direct inspection of source tabs without requiring a full Firestore import.

## User workflow
1. Open Data Center / Spreadsheet Data Hub.
2. Choose Supplier Evaluation or V2 PRF/SRF.
3. Select a tab.
4. Inspect the source row count and first 50 rows.
5. Use Sync Center only when you want the app database reconciled with the source.

This avoids confusion between "data exists in the spreadsheet" and "data has already been copied into Firestore".
