# Admin Console Enhancement

This package adds a dedicated administrator console instead of treating the admin role as the same workspace as normal users.

## Admin console sections
- Admin Dashboard
- PO Control
- Supplier Master + rating snapshot
- Supplier Evaluation administration + resend email
- RouteTrack Control Center + history timeline
- Buyers
- Delivery Addresses
- Employees / Requisitioners
- Users & Roles
- Overdue Delivery Notifications
- Supplier + PO Analytics
- Full Spreadsheet Sync Center
- System Administration Settings

## Apps Script feature parity covered from the supplied SISC basis
- Vendors / supplier management
- Buyers
- Delivery addresses
- Employees
- User access management and roles
- Supplier evaluation queue and resend controls
- Supplier evaluation criteria and score summaries
- Supplier analytics / completion / participation / trend-style views
- PO analytics / spend / status / overdue / lead time views
- Company settings, approver, AMD evaluation recipients and logo
- Overdue notification workflow without Apps Script
- PO, PRF and routing reconciliation

## Sync behavior
The sync route remains a full reconciliation between Firestore and:
- PO for Evaluation
- PRF Details v2
- Routing / monitoring sheet

Completed supplier evaluations are protected from being downgraded to pending when an older or incomplete spreadsheet status is encountered.

## RouteTrack note
The user provided a RouteTrack GitHub repository URL, but its source could not be downloaded in this environment. The admin console therefore integrates the RouteTrack-style routing data model already present in the purchasing system rather than claiming to have copied unavailable repository code.
