# POS Refactor Guide

This is a review of the code as it is today plus a plan you can follow and code yourself.
Every bug has a location (`file:line`), what the code **does now**, and what we **want** it to do.

Contents

1. [How the app works today (reverse-engineered)](#1-how-the-app-works-today)
2. [Target folder structure](#2-target-folder-structure)
3. [Tight coupling → loose coupling](#3-tight-coupling--loose-coupling)
4. [Technical bugs](#4-technical-bugs)
5. [Security bugs](#5-security-bugs)
6. [Business bugs](#6-business-bugs)
7. [Step-by-step plan (what you code, in which order)](#7-step-by-step-plan)
8. [Concepts to learn before coding](#8-concepts-to-learn-before-coding)

---

## 1. How the app works today

```
Electron main.js ──require──▶ backend/server.js (Express on :5100, all interfaces)
      │                              │
      │ loadURL(localhost:5100)      ├── serves backend/client/build (compiled React, NO source in repo)
      ▼                              ├── /auth /products /orders /pos /category /tax /notes /config
BrowserWindow (React UI)             ├── SQLite via knex + objection (backend/database/db.sqlite)
      │                              └── calls https://pos.dftech.in for sync, backup, updates
      └── preload.js → ipcMain (print receipt, print report, barcode label, open drawer)
```

A sale today: the React UI computes everything (prices, totals, tax, cash for drawer), then
`POST /orders/create` just stores what the client sent, decrements stock, adds to the register's
cash and creates low-stock notifications — all in one 120-line route handler.

Important: **the React source code is not in this repo**, only compiled bundles. `backend/client/`
is 58 MB and `client/build/static/js` holds 17 old `main.*.js` bundles, only one of which is used.
You cannot fix UI bugs without the source — find it before anything else.

---

## 2. Target folder structure

What's wrong now:

| Problem | Where |
|---|---|
| Electron code, print templates, IPC and window setup all in one file | `main.js` |
| Two `package.json`, two identical `knexfile.js` | root + `backend/` |
| `utils.js` **and** `utils/` folder; `require('../utils')` silently picks the file | `backend/` |
| Routes contain DB queries, business rules, image processing, HTTP calls to the cloud | `backend/routes/*.js` |
| Two models for the same table (`Category` and `ProductCategory`) | `backend/models/` |
| `runCommand` copy-pasted 3 times | `server.js`, `utils.js`, `routes/products.js`, `routes/pos.js` |
| Two multer configs + one inline in notes | `middlewares/multer.js`, `routes/products.js`, `routes/notes.js` |
| Compiled UI build inside the backend, old builds never cleaned | `backend/client/` |
| Runtime data (DB, images, reports) lives inside the app code folder | `backend/database`, `backend/tmp` |
| Migrations have no timestamps → wrong run order (see bug T1) | `backend/migrations/` |

Target (feature-based / "module" structure):

```
pos/
├── package.json                  # ONE package.json for the whole app
├── .env.example                  # documented config keys (no secrets committed)
├── assets/
│   ├── logo.png                  # stable path — not a hashed build file
│   └── pos.ico
├── electron/                     # desktop shell only — knows nothing about SQL
│   ├── main.js                   # ~30 lines: start server, create windows, register IPC
│   ├── preload.js
│   ├── windows/
│   │   ├── mainWindow.js
│   │   └── customerDisplay.js
│   ├── ipc/
│   │   ├── print.ipc.js          # print-content, print-report, generate-barcode, draw-cash
│   │   └── app.ipc.js            # relaunch, close-window, fullscreen, reload
│   └── printing/
│       ├── printHtml.js          # ONE function: hidden window → print → close
│       └── templates/
│           ├── receipt.js
│           └── barcodeLabel.js
├── server/                       # was backend/
│   ├── index.js                  # createServer({ config }) → { start, stop }
│   ├── app.js                    # builds the express app, mounts modules
│   ├── config/
│   │   └── index.js              # port, paths, JWT secret, cloud URL, currency — from env
│   ├── db/
│   │   ├── knex.js               # the ONE db connection
│   │   ├── knexfile.js
│   │   ├── migrations/           # 20250101000000_create_users.js … (timestamped)
│   │   └── seeds/
│   ├── modules/                  # one folder per business feature
│   │   ├── auth/
│   │   │   ├── auth.routes.js        # URL → controller (no logic)
│   │   │   ├── auth.controller.js    # req/res ↔ service (no SQL)
│   │   │   ├── auth.service.js       # business rules (no req/res)
│   │   │   └── user.model.js
│   │   ├── products/   (routes, controller, service, repository, model, product.validators.js)
│   │   ├── categories/
│   │   ├── taxes/
│   │   ├── orders/
│   │   ├── register/   (cash register open/close, cashier sessions)
│   │   ├── reports/    (reports.service.js, report.template.js)
│   │   ├── settings/
│   │   ├── notifications/
│   │   └── notes/
│   ├── integrations/
│   │   ├── cloudClient.js        # every call to pos.dftech.in goes through here
│   │   └── updater.js            # install-update logic
│   └── shared/
│       ├── middleware/  auth.js, upload.js, validate.js, errorHandler.js, asyncHandler.js
│       ├── errors/      AppError.js
│       └── utils/       money.js, dates.js, storage.js, images.js
└── client/                       # React SOURCE goes here (build output is generated, gitignored)
```

Runtime data moves out of the code folder to Electron's `app.getPath('userData')`
(e.g. `C:\Users\<you>\AppData\Roaming\POS Infinity\`):

```
userData/
├── db.sqlite
├── images/products/  images/notes/
└── reports/
```

Why: an update that overwrites the app folder can no longer wipe the database, and the
installed app (inside `Program Files` / asar) isn't writable anyway.

---

## 3. Tight coupling → loose coupling

### 3.1 What "tightly coupled" looks like here

`POST /orders/create` (`backend/routes/orders.js:48`) does **seven jobs** in one function:

1. reads HTTP body
2. inserts order
3. inserts cashier session
4. updates cash register
5. reads two settings
6. updates stock for every product
7. creates notifications

To test "stock goes down after a sale" you must start Express, send an HTTP request and have
a real SQLite file. To change how notifications work you must edit the order route.
That is tight coupling: **everything knows about everything**.

Other examples:

| Tight coupling | Where | Loose version |
|---|---|---|
| Product update calls `axios.post('https://pos.dftech.in/…')` before saving locally | `routes/products.js:263` | `productService.update()` saves locally, then emits `product.updated`; a `cloudSync` listener pushes it (and retries later if offline) |
| Report logic + HTML template + PDF + file writing in one function | `routes/orders.js:243`, `utils.js:12` | `reportService.build()` returns numbers → `reportTemplate.render(data)` → `pdfWriter.save()` |
| `JWT_SECRET` hard-coded in two files | `middlewares/loggedIn.js:2`, `routes/auth.js:10` | `config.jwtSecret`, injected |
| Logo path is a hashed build file | `main.js:8`, `routes/orders.js:19` | `config.logoPath` → `assets/logo.png` |
| DB path relative to current working dir | `server.js:26`, `knexfile.js` | `config.dbPath` from `app.getPath('userData')` |
| `main.js` requires `./backend/server` and the server reads files from `../client/build` | `main.js:5`, `server.js:20` | Electron calls `createServer({ config })`; the server gets paths from config |

### 3.2 The layers (what each one is allowed to know)

```
routes      → only URLs + middleware        knows: express Router
controller  → req/res ↔ service             knows: req, res, service
service     → business rules                knows: repositories, other services. NOT req/res
repository  → SQL / objection queries        knows: models, knex. NOT business rules
model       → table shape + relations
```

Rule of thumb: **a service must be callable from a test with plain objects**, no Express needed.

### 3.3 Reverse-engineering example: `/orders/create`

What it does now (simplified):

```js
router.post('/create', fetchuser, async (req, res) => {
  const order = await Order.query().insert({...req.body});        // trusts client
  await CashierSession.query().insert({...});
  await CashRegister.query().patch({ closing_cash: raw('closing_cash + ?', [req.body.cashForDrawer]) });
  for (const [id, qty] of Object.entries(req.body.sessionData.quantity)) {
    await Product.query().patch({ quantity: raw('quantity - ?', [qty]) });
    if (prod.quantity < minStock.value) await Notification.query().insert({...});
  }
  res.json({...});
});
```

What we want — the shape (you write the bodies):

```js
// orders.routes.js
router.post('/', auth, validate(createOrderSchema), asyncHandler(ordersController.create));

// orders.controller.js
create: async (req, res) => {
  const result = await ordersService.checkout({ cashierId: req.user.id, ...req.body });
  res.status(201).json(result);
}

// orders.service.js  — gets its dependencies passed in (dependency injection)
function createOrdersService({ db, orderRepo, productRepo, registerRepo, events }) {
  return {
    async checkout({ cashierId, registerId, items, payments }) {
      return db.transaction(async (trx) => {
        // 1. load products from DB, compute prices/tax/total ON THE SERVER
        // 2. insert order + order lines
        // 3. update stock
        // 4. add only the CASH part of payments to the register
        // after commit: events.emit('order.created', order)  → notifications listen to this
      });
    },
  };
}
```

Now the order service doesn't know notifications or the cloud exist — they **subscribe** to
`order.created`. That's the loose coupling.

---

## 4. Technical bugs

**T1. A fresh install can never be set up — migrations run in the wrong order.**
`backend/migrations/` — knex runs migrations sorted **alphabetically by filename**.
Now: first runs `_drop_columns_from_orders.js` (table `orders` doesn't exist yet → crash).
Even if it passed, `cashier_sessions_table.js`, `notifications_table.js`, `reports_table.js`
create tables that earlier files already created → crash. `_drop_columns_from_products.js`
actually alters `orders`, not `products`. `product_categories.js` creates an unused
`products_categories` (typo) table.
Want: one clean set of timestamped migrations (`20250101000000_create_users.js` …) that
describe the **current** schema, so `knex migrate:latest` works on an empty DB.

**T2. Signup never works.** `routes/auth.js:25-40`
- `res.status(400).res.json(...)` → `TypeError` (there is no `res.res`).
- `await User.query().where('email', …)` returns an **array**; `[]` is truthy → always
  "A user with that email already exists!".
- Validates `username` but saves `email`; `User.query().insert(...)` is not awaited.
Combined with T1: **there is no way to create the first user on a new machine.**
Want: a seed/first-run flow that creates the admin, and a working signup only an admin can call.

**T3. `require('../models/user')` lowercase.** `routes/auth.js:2` — file is `User.js`.
Works on Windows, crashes on Linux/macOS (case-sensitive FS).

**T4. `/auth/getuser` always returns null.** `routes/auth.js:94` reads `req.body.id`, the
middleware sets `req.body.myID`.

**T5. Async errors hang requests.** Express 4 does not catch rejected promises. Routes without
try/catch hang forever on error: `POST /pos/session` (`routes/pos.js:61`, crashes when the
register has no sessions yet: `null.session_id`), `GET /config/settings/:key`.
Some catch blocks `return {...}` instead of `res.json(...)` → request hangs:
`routes/products.js:80`, `routes/pos.js:51`. `GET /config/stock-alert` sends nothing when no
alert exists (`routes/config.js:14`). `GET /orders/remove-report/:id` has an empty catch.
Want: `asyncHandler` wrapper + one error middleware.

**T6. Shared mutable `error`/`output` objects.** Every route file has
`let error = {status:false, message:...}` at module level and mutates `error.message`.
Two requests at once overwrite each other's message. Want: create the error object per request
(or `throw new AppError(...)`).

**T7. Product import always creates duplicates.** `routes/products.js:165`
`let product = Product.query()...first()` — no `await`, so `product` is a query builder
(always truthy) → always `insertGraph`. The `else` branch would crash anyway (`product.id`
with no product), and the if/else is inverted (insert *when found*). Also crashes when a row
has no category (`normalizeSpaces(undefined)`), and the uploaded xlsx is never deleted.

**T8. `/products/create` crashes without a barcode.** `routes/products.js:110`
`(req.body.barcode).trim()` → TypeError when barcode is empty (vegetables have no barcode).
Same for `/products/update` with `code` (`:208`). `?? null` after `.trim()` does nothing.

**T9. `/products/create-custom` writes images to a wrong path.** `routes/products.js:421`
`__dirname + '../tmp/products'` → `.../routes../tmp/products` (missing `/`). Then
`product.tax.match(...)` crashes when tax is null — but the product was **already inserted**,
so the client is told "failed" while the product exists.

**T10. Tax parsing is wrong.** `routes/products.js:437`: `"7.5 %".match(/\d+/g).join('')` →
`"75"` → **75 %** tax. Taxes are stored as free text (`"19 %"`, `"19"`, `"19%"`) and parsed
differently in 4 places (`split(' ')`, `parseFloat`, regex). Want: `tax_id` FK + numeric `rate`.

**T11. `/products/convert` is completely broken.** `routes/products.js:377` — no `await` on
axios, `path.basename()` without argument throws. Delete it.

**T12. `downloadAndProcessImage` paths.** `routes/products.js:319` writes to `tmp/products`
relative to the **current working directory**; on failure it returns the URL and the caller
stores `products/https://...` as image path.

**T13. Product delete fails if the image file is missing.** `routes/products.js:286` — unlink
throws → "Failed to remove the image" → product can't be deleted.

**T14. Wrong `Order.session` relation.** `models/Order.js:36` joins
`orders.cash_register_id → cashier_sessions.cash_register_id` → returns *some* session of the
register, not this order's. Should be `orders.id → cashier_sessions.order_id`.

**T15. Report crashes.** `routes/orders.js:260` uses `today`, which is never defined →
`ReferenceError` when `to` is missing. If `today`/Z is requested without `register_id`,
`orders` is `undefined` → `for…of undefined` crash. `select('*')` on a join: `cashier_sessions.id`
overwrites `orders.id`.

**T16. Category filter on GET never works.** `routes/products.js:55`, `routes/pos.js:26` read
`req.body.category_id` on a GET (no body). That branch also calls `withGraphFetched()` with no
argument. Use `req.query.category_id`.

**T17. "Self-healing" by running shell commands in a request.** `routes/products.js:80`,
`routes/pos.js:51`, `server.js:113`, `utils.js:151` run `npx knex migrate:latest` or
`npm install` from inside an HTTP request when an error message contains "column".
In an installed app there is no npm. Want: run migrations once at startup.

**T18. Two DB connections, one relative.** `server.js:8` (knex, absolute path) and
`server.js:26` (`sqlite3.Database('./database/db.sqlite')`, relative to cwd, never used).

**T19. Logo path hard-coded to a hashed build file.** `main.js:8` reads
`client/build/static/media/logo.2d2e09f65e21f53b1f9f.png` with `readFileSync` at startup.
After any UI rebuild/update the hash changes → **the app crashes on launch.**

**T20. Electron leftovers.** `main.js`
- `nodeIntegration: true` (comment says the opposite). Should be `false`.
- `preload.js` exposes `getPrinters` (`invoke("get-printers")`), `updateCustomerDisplay`,
  `dialog` — no handler exists in `main.js`.
- `renderer.js` uses `window.electron` (doesn't exist) — dead file.
- `backendProcess` is never set. `devTools:false` is not a valid BrowserWindow option
  (it belongs in `webPreferences`).
- Closing the main window with Alt+F4 leaves the customer display open → app never quits.
- `npm start` = `electron . && nodemon backend/server.js` — nodemon runs after Electron exits,
  and `server.js` doesn't start itself.

**T21. String columns for numbers.** `products.price`, `products.quantity`, `orders.amount`,
`cash_register.*_cash`, `taxes.amount`, `settings.value` are all `string`. This causes B9.

---

## 5. Security bugs

**S1. The server is open to the whole shop network.** `server.js:139` `app.listen(port)`
binds `0.0.0.0` + `cors()` allows any origin. Anyone on the same Wi-Fi can call the API.
Want: `app.listen(port, '127.0.0.1')` and restrict CORS.

**S2. Destructive routes without login** (combine with S1):
`GET /orders/remove-order/:id` (deletes sales!), `GET /orders/remove-report/:id`,
`GET /orders/reports`, `GET /orders/last-order`, `POST /products/update`,
`POST /products/updateStock/:id`, `GET /category/toggle/...`, `GET /tax/toggle/...`,
`POST /notes/create`, `GET /config/notification/delete/:id`, `POST /pos/session`,
`POST /pos/opening-day-cash-amount`, `GET /install-update`, `GET /install-backend-update`.

**S3. Remote code execution via updates.** `server.js:43-103` — an unauthenticated GET
downloads a zip from the internet and extracts it **over the app's own code** (`../`) with no
signature or checksum check. Want: Electron's `autoUpdater` / electron-updater with signed builds.

**S4. Hard-coded secrets.** JWT secret `'whateverItWas'` (`middlewares/loggedIn.js:2`,
`routes/auth.js:10`), cloud API key `'Vyo0WttjzBTh'` (`routes/products.js:265`, `:297`).
Both are in git history now — rotate them. Tokens never expire (`jwt.sign` without `expiresIn`).

**S5. Password hash sent to the browser.** `/auth/login` and `/auth/getuser` return the full
`user` row including `password`.

**S6. API key in the URL.** `GET /products/remove/:id` expects `"<id>_<appKey>"`.

**S7. Whole database uploaded to the cloud.** `GET /config/upload-db/:client` uploads the
SQLite file (password hashes, all sales). OK as a backup feature only if it's over HTTPS with
auth and the user knows; today any logged-in cashier can trigger it.

**S8. Path traversal in uploads.** Product image filenames are built from user input
(`name`/`barcode`) → a name like `../../x` writes outside the folder. Multer in
`middlewares/multer.js` keeps `file.originalname` as-is and has no type/size limit.

**S9. GET for state changes.** `remove`, `toggle`, `inventory/:state`, `clear-notifications`
— use POST/PATCH/DELETE.

**S10. `loggedIn` answers 200 on a bad token** (`middlewares/loggedIn.js:14`) → the UI can't
tell "logged out" from "ok". Return 401.

---

## 6. Business bugs

These make the shop lose money, stock or trust in the numbers.

**B1. The server trusts the prices and totals the client sends.** `routes/orders.js:48-58`
Now: `amount`, `price[productId]`, `total`, `cashForDrawer` all come from the UI and are saved
as-is. Want: the client sends `{productId, qty}` (and an explicitly authorised price override);
the server loads prices/tax from the DB and computes the total. Price overrides should be
recorded (who, why).

**B2. No transaction around a sale.** If anything fails halfway (e.g. a deleted product), the
order exists but stock/register are only partly updated. Also: when `sessionData` is missing,
the order is still inserted but the response says `status:false` (`:134`) → cashier retries →
**duplicate order**.

**B3. Deleting an order corrupts the register and stock.** `routes/orders.js:432`
- Hard delete, no auth, no record of who/why (no audit trail; in many countries this is
  illegal for POS systems — you must *void/cancel*, not delete).
- Stock is not returned (the code even says `// need to add stocks back also ?`).
- It subtracts the **full** `order.amount` from `closing_cash` even if the order was paid by
  **card** — but at sale time only `cashForDrawer` was added. Expected cash in drawer goes wrong.
Want: `POST /orders/:id/void` → status `voided`, reason, user, restore stock, reverse only the
cash part.

**B4. Card part of split payments disappears from reports.** `routes/orders.js:321`
`// card += Number(Card)` is commented out → for split payments
`cash + card + account ≠ total`. The Z-report won't reconcile with the card terminal.

**B5. Category totals ignore quantity.** `routes/orders.js:297`
`sPrice?.[id] ?? product.price * QT[id]` — `*` binds before `??`, so when a sold price exists
the result is **unit price, not price × qty**. Buying 5 rice bags counts as 1 in category sales.
Want: `(sPrice?.[id] ?? product.price) * QT[id]`.

**B6. Reports use today's product data, not what was sold.** `routes/orders.js:288, 304`
Tax and "discounts" are computed from the **current** product price/tax. Change a price today →
last month's reports change. Want: store each sold line (`order_items`: product_id, name, qty,
unit_price, tax_rate, tax_amount, line_total) at sale time and build reports only from that.

**B7. Tax is calculated wrong.** `routes/orders.js:308`
- `tax/100 * price` treats the price as **tax-exclusive**; shelf prices in a shop are normally
  **tax-inclusive** → included tax = `price × rate / (100 + rate)`.
- Not multiplied by quantity.
- "Included Taxes" section prints the **rate** of the first product seen per type, not the
  amount (`:306`).

**B8. Discounts/returns numbers are wrong.** `:310` discounts = `soldPrice − currentPrice`,
summed per product (ignores qty, includes returns because returns are negative prices).
`:326` returns = sum of negative **unit** prices (ignores qty). Returns are modelled as
"negative price" in the same sale, which is also how stock gets added back (`:105`).
Want: an explicit `type: 'sale' | 'return'` per line and a separate refund flow.

**B9. Low-stock alert compares strings.** `routes/orders.js:117` — `quantity` and the
setting value are TEXT, so `"7" < "10"` is **false** (string comparison). Alerts don't fire.
Every sale of a low product creates **another** notification (no de-duplication).

**B10. Product sync resets stock to 5000.** `routes/products.js:491,501,513`
Every cloud sync sets `quantity: 5000` on existing products → real stock counts are destroyed.
`create-custom` defaults to 3000. Want: sync never touches `quantity` of existing products.

**B11. Editing a product needs internet.** `routes/products.js:263` — the cloud call happens
**before** the local update; offline → exception → product not updated. A POS must work
offline. Want: save locally first, queue the sync (outbox table), retry later.

**B12. Store settings are saved per cashier.** `STOCK_ALERT`, `INVENTORY_IS` are keyed by
`user_id` (`routes/config.js`, `routes/orders.js:85-92`). Admin turns inventory OFF → for a
cashier who has no row it's still ON. Want: store-level settings (no `user_id`) and only UI
preferences per user.

**B13. Z-report can run many times; reports overwrite each other.** `routes/orders.js:225-241, 366`
- No check that the register is already closed (the check is commented out at `:331`).
- PDF name is `dd_MM_yyyy_Z_report.pdf` → second Z-report of the day **overwrites** the first.
- The `reports` row is inserted even if PDF creation fails (callback not awaited).
- No sequential Z-number. Want: Z-report = closes the register once, gets the next number,
  stored immutably.

**B14. Many registers can be open at once.** `routes/pos.js:66` — opening cash never checks
for an existing open register, `user_id` is `undefined` (no auth middleware), and
`opening_cash` is stored as text with `'€ '` while `closing_cash` is parsed to a number.

**B15. Session numbers race.** `routes/pos.js:61` "last session_id + 1" — two tills, or a
double-click, get the same number.

**B16. Dates in UTC.** `created_at: new Date().toISOString()` + `STRFTIME('%Y-%m-%d', created_at)`
→ sales between 00:00 and 01:00/02:00 local (Europe) are counted on the **previous day**.

**B17. Currency is hard-coded.** `'€ '` in `day-close` (`routes/orders.js:407`), `€` on barcode
labels (`main.js:215`), and at login any currency that isn't "euro" becomes `₹`.
Want: currency from settings, formatting in one `money.format()`.

**B18. Money as strings/floats.** `0.1 + 0.2 = 0.30000000000000004`. Over a day of sales the
report total can drift by cents. Want: store money as **integer cents**.

**B19. Deleting a category or tax orphans products.** Hard delete, no FK check
(`routes/category.js:77`, `routes/tax.js:68`). Products keep `category_id` pointing nowhere.
Category ordering for one specific shop (`veg`, `fruits`, `Rice`…) is hard-coded in SQL
(`routes/category.js:19`) → should be a `sort_order` column.

**B20. Barcode rule for vegetables is fragile.** `routes/products.js:199` uses `indexOf(...)`
as a boolean (`-1` is truthy). "Fresh Vegetables" → barcode required; "Vegetables" → not.
Want: a `requires_barcode` flag on the category (or `includes()`).

---

## 7. Step-by-step plan

Do them **in order**. After each step: run the app, make a sale, print an X-report. Commit.
Send me your code after each step and I'll tell you what's broken.

**Step 0 — Safety net (no code changes)**
- Copy a real `db.sqlite` from the shop as a test DB.
- Find the React source. Add `backend/client/` build output to `.gitignore` once you have it.
- Rotate the JWT secret and the cloud API key (they are public in git now).

**Step 1 — Move files, change nothing else**
- Create the folders from section 2. Move files with `git mv` so history is kept.
- Fix every `require` path. Delete `renderer.js`, root `knexfile.js`, `models/Category.js`
  (use `ProductCategory`), `/products/convert`.
- Merge to one `package.json`.
- ✅ Done when the app runs exactly like before.

**Step 2 — Config + one DB connection**
- `server/config/index.js` exports `{ port, host, dbPath, uploadsDir, jwtSecret, cloudUrl, cloudKey, logoPath }`.
- `server/db/knex.js` creates the only knex instance from `config.dbPath`.
- Replace every hard-coded path/secret with `config.x`.
- Fix T19 (logo) and S1 (`127.0.0.1`).

**Step 3 — Shared middleware**
- `asyncHandler`, `errorHandler`, `AppError` (fixes T5, T6).
- `auth` middleware sets `req.user = { id, type }` (not `req.body.myID`), returns 401.
- One `upload` middleware with size/type limits and safe filenames.

**Step 4 — Rebuild migrations (T1)**
- Dump the current schema of the real DB (`sqlite3 db.sqlite .schema`).
- Write timestamped migrations that recreate exactly that schema on an empty DB.
- Add a seed that creates the first admin user (fixes T2 for new installs).
- Run `migrate:latest` once at server start; remove all `runCommand` hacks (T17).

**Step 5 — Split ONE module fully: `products`**
- routes → controller → service → repository. Use it as the template for the others.
- Fix T7, T8, T9, T12, T13, T16, B10, B11 (cloud call moves to `integrations/cloudClient.js`
  and runs *after* the local save).

**Step 6 — `orders` + `register` (the money part)**
- `ordersService.checkout()` in a transaction (B1, B2).
- New `order_items` table (B6). Server computes totals and inclusive tax (B7).
- Void instead of delete (B3). One open register per till (B14).
- Emit `order.created` → `notifications` module listens (B9).

**Step 7 — `reports`**
- Build reports only from `order_items` + payments. Fix B4, B5, B7, B8, B13, B16.
- Separate: `reportsService.build()` → `reportTemplate.render()` → `pdfWriter.save()`.

**Step 8 — The rest**: categories, taxes, settings (B12), notes, auth (S5, T3, T4).

**Step 9 — Electron**: split `main.js` (section 2), `nodeIntegration:false`, remove dead IPC
names, replace the zip updater with electron-updater (S3).

---

## 8. Concepts to learn before coding

Short intros — read the one you need before the step that uses it.

### Dependency Injection (Step 2, 5, 6)
Instead of a file doing `require('../models/Product')` itself, it **receives** what it needs:

```js
// tightly coupled: this function can only ever use the real DB
const Product = require('../models/Product');
async function getStock(id) { return (await Product.query().findById(id)).quantity; }

// injected: the caller decides which repo to pass (real DB, or a fake one in a test)
function createStockService({ productRepo }) {
  return { getStock: async (id) => (await productRepo.findById(id)).quantity };
}
```

One place (`server/app.js`) builds everything and wires it together — the "composition root".

### Repository pattern (Step 5)
A repository is an object whose only job is talking to the DB for one entity:
`productRepo.findByBarcode(code)`, `productRepo.decrementStock(id, qty, trx)`.
Services never write SQL, so you can change the DB without touching business rules.

### Express error middleware + asyncHandler (Step 3)
Express recognises an error handler by its **4 arguments** `(err, req, res, next)`.
In Express 4 an `async` route that throws is *not* caught automatically, so we wrap it:

```js
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

`next(err)` sends the error to the error middleware → one place builds the error response.

### Database transactions (Step 6)
"All or nothing": either every write of a sale is saved, or none.
In knex: `await knex.transaction(async (trx) => { await trx('orders').insert(...); ... })` —
if anything inside throws, everything is rolled back. Every query inside must use `trx`
(objection: `Model.query(trx)`).

### EventEmitter (Step 6)
Node's built-in `events` module. One part says "this happened", others react, and neither
knows about the other:

```js
const { EventEmitter } = require('events');
const events = new EventEmitter();
events.on('order.created', (order) => { /* check low stock, create notification */ });
events.emit('order.created', order);
```

### Environment config with dotenv (Step 2)
`dotenv` (new library) reads a `.env` file into `process.env` at startup:
`require('dotenv').config()` then `process.env.JWT_SECRET`. `.env` is gitignored; commit only
`.env.example` with the key names.

### Money as integer cents (Step 6)
Store `€12.99` as `1299`. Add/multiply integers, divide by 100 only when displaying.
Rounding tax: `Math.round(lineTotalCents * rate / (100 + rate))`.
