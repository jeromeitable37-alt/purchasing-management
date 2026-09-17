# Spreadsheet Data Auto-Fill Enhancement

The purchasing system now uses synchronized spreadsheet data as master/reference data so users do not have to retype values that already exist in the source workbooks.

## Sources

- `V2 - PRF AND SRF ONLINE MONITORING.xlsx` → PRF/SRF details and purchaser names.
- `_PURCHASING SUPPLIER EVALUATION.xlsx` → supplier/evaluation data and requisitioner names/emails.

## Auto-populated areas

- Purchase Order: PRF lookup fills requisitioner, requisitioner email, purpose, department, and item description; supplier/buyer/requisitioner fields have spreadsheet-backed suggestions.
- Supplier Evaluation: PO lookup fills supplier, PRF and amount; evaluator lookup uses synchronized employee/requisitioner emails.
- Routing & Monitoring: reference lookup can load an existing synced PRF/SRF/PO routing record, including From/To/current holder/status/history.
- Admin master data: Suppliers, Buyers, and Employees are refreshed from synchronized spreadsheet reference data.

Delivery addresses remain manual because the supplied workbooks did not contain a reliable delivery-address master list.
