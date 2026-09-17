# Quota-safe paged Firestore history

## What changed
- Large Firestore collections now use bounded realtime listeners instead of full-collection listeners.
- Initial live windows: Purchase Requests 75, Purchase Orders 75, Routes 100, Supplier Evaluations 100, PRF details 150, Documents 50.
- Older rows are loaded on demand with a Firestore cursor and `Load older records` / `Load older admin data` controls.
- Realtime updates are merged into already-loaded historical pages so loading older data does not break live updates.
- Pagination state resets on logout/re-authentication.
- Small master collections (suppliers, buyers, employees, addresses) remain fully live-loaded because they are expected to remain small.

## Why
The previous UI attached realtime listeners to entire large collections. Each listener could read thousands of documents on initial load and again as clients reconnect. The new bounded windows sharply reduce those reads while keeping recent records live.

## Operational behavior
- The spreadsheet sync endpoint remains separate from the client Firestore windowing.
- A historical record is not deleted from the UI when a newer record arrives; loaded older pages remain until the user leaves the session.
- `Load older records` reads one additional page only for the current section.
- Admin's `Load older admin data` loads one page each for requests, purchase orders, routes, and evaluations.
