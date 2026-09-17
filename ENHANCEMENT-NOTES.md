# PMS V2 Final Enhancement Notes

## Admin UI
- Reworked administrator console to reuse the same teal/green layout and sidebar navigation pattern as the purchasing user workspace.
- Admin navigation is stateful and clickable for Dashboard, PO Control, Supplier Evaluation, RouteTrack Control, Supplier Master, Buyers, Addresses, Employees, Users & Roles, Notifications, Analytics, Sync Center and System Settings.
- Cross-workspace buttons explicitly identify when they open the user workspace.

## Supplier Evaluation
- Historical DATABASE evaluations are imported and protected as submitted when the source row contains an evaluation date, score/final rating, or completed/submitted state.
- Existing pending Firestore evaluation rows are reconciled to submitted when their PO/PRF/supplier matches a completed historical source row.
- Historical evaluation records are treated as source history and are not exported back into the PO-for-evaluation queue, avoiding queue pollution.
- Email sending now detects the Resend placeholder/test sender and returns a clear configuration message instead of exposing a raw 403 domain error.

## Routing / RouteTrack
- Route import scans all PRF/SRF monitoring tabs instead of only the first monitoring tab.
- Header rows are detected automatically, including monitoring sheets whose headers begin on row 2, 3 or 4.
- SRF references are recognized in addition to PRF references.
- Routing state is derived from the latest populated workflow date, so From / To / Current Holder are based on the most recent V2 stage rather than a fixed hard-coded path.
- RouteTrack records keep source sheet, source row and reconstructed history.
- A dedicated RouteTrack tab is synchronized into the routing/V2 workbook without destroying the original monitoring-tab layout.

## Sync performance
- Existing Firestore records for evaluations, PRF details and routes are loaded once per sync rather than queried one row at a time.
- Source rows are fingerprinted and only changed/new records are written after the baseline exists.
- Initial automatic sync runs shortly after login, followed by a 15-minute interval.

## Resend production setup
- For production supplier emails to operational recipients, set EMAIL_FROM to an address on a verified Resend domain. Resend requires a verified sending domain for recipients beyond test-mode restrictions.
- For a test-only sender, use onboarding@resend.dev and set RESEND_TEST_RECIPIENT to the permitted test inbox for the Resend account.

## Expected V2 routing coverage
The supplied V2 workbook contains PRF and SRF monitoring tabs across SISC and school/entity-specific monitoring sheets. The final importer is designed to ingest every tab whose name contains PRF or SRF, excluding database/summary/report/helper tabs, rather than limiting the sync to PRF - SISC.
