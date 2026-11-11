# Website orders (POS API sync)

The POS copies orders from the website's POS API (`https://<admin-domain>/api/pos/v1`, Bearer key)
and sends status changes back. Code: `backend/utils/websiteSync.js`, `backend/routes/website.js`,
UI `frontend/src/components/website/Website.js`.

## Setup
Log in as an **admin**, open **Website** and press **Connection**. Enter the website address
(`https://admin.india-gate.nl`; `/api/pos/v1` is added if missing) and the `POS_API_KEY`, press
**Test connection**, then **Save**. Cashiers can see and process orders but cannot see or change the connection.

The key is stored in the `website_state` table of the POS database on this computer. It is never sent
to the UI (only its last 4 characters). Changing the website address clears the saved orders.

## How it syncs
- First run: `GET /orders` (all active orders). After that, every ~7 seconds:
  `GET /orders?updated_since=<cursor>&status=all`, so orders that were delivered or cancelled meanwhile also update.
- The cursor is the website's `meta.server_time` from the first page, saved only after every page was read.
- Orders are saved by the website's order id (`web_orders`), `deleted: true` removes them.
- A new `pending` order creates a notification for every POS user, and a toast if the Website page is open.
  The very first sync gives one summary notification instead of one per waiting order.
- Errors back off (up to 60 s; a `429` waits the full 60 s). The page shows the last error and keeps the saved orders.
- Delivered/cancelled/returned/refunded/failed orders are listed for 14 days and deleted from the POS after 30.

## Changing a status
The UI only offers the order's `allowed_next_statuses`. `POST /orders/{id}/status` is sent with
`expected_status` (what the screen shows) and `changed_by` (the logged-in POS user). A `409` means someone
else changed the order first: the POS refreshes it and tells the cashier. A `422` shows the website's message.

## Tests
`cd backend && npm test` runs the POS against a fake website API.
