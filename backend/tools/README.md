# Move data from the original POS to the new POS

The new POS runs **next to** the original POS without touching it:

| | Original POS | New POS |
|---|---|---|
| Port | 5100 | 5101 |
| App name / profile folder | POS Infinity | POS Infinity New |
| Packaged folder (`npm run build`) | POS-ov | POS-New |
| Database | its own `backend/database/db.sqlite` | its own `backend/database/db.sqlite` |

If the original POS is running, the new POS does not open the customer display
(the original one keeps it).

## Import the data

`import-old-db.js` copies products, categories, taxes, users, settings and
product images, and (without `--catalog`) also the sales history.

- The original database is opened **read-only**. The original POS can stay open.
- A consistent snapshot is taken (`VACUUM INTO`), and only the copy is upgraded
  (missing tables/columns added).
- Row counts are checked; the import stops if anything doesn't match.
- An existing new-POS database is kept as `db.sqlite.bak-<time>`.

### Catalog only (no old sales history)

Add `--catalog` to any command below. You get categories, products, images,
taxes, users (same logins), settings and customers. Left out: orders, receipts,
cash registers, reports and stock alerts. The new POS starts at order #1.

**Close the new POS first.** Then, from the new POS `backend` folder:

```
node tools/import-old-db.js --catalog "<ORIGINAL>\resources\app\backend\database\db.sqlite" "<ORIGINAL>\resources\app\backend\tmp"
```

No Node.js on the shop PC? Use the new POS's own executable as Node
(run in `cmd` from the new POS folder, the one containing `POS-New.exe`):

```
set ELECTRON_RUN_AS_NODE=1
POS-New.exe resources\app\backend\tools\import-old-db.js --catalog "<ORIGINAL>\resources\app\backend\database\db.sqlite" "<ORIGINAL>\resources\app\backend\tmp"
```

Log in to the new POS with the **same username/password** as the original.

## Good to know

- After the import, the two databases are **separate**. A sale in one POS does
  not appear in, or change stock in, the other. Re-running the import replaces
  the new POS data with a fresh copy of the original.
- Don't use "Install update" (UI/backend update from pos.dftech.in) in the new
  POS: it downloads a build that uses port 5100 again.
