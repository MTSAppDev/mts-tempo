# Tempo backend

Working Express/Mongoose API connected to the React frontend. Email delivery is intentionally excluded.

## Local startup

MongoDB must be running. From `backend`:

```powershell
npm install
# Only if .env does not exist:
Copy-Item .env.example .env
npm run setup
npm run dev
```

`npm run setup` asks for the initial Admin name, email and hidden password. It works only before any Admin exists. No preset credentials are installed. An alternative `npm run admin:create` accepts `{ "name", "email", "password" }` as JSON on stdin for scripted local setup. Never put passwords in command-line arguments or source files.

API: `http://127.0.0.1:4000/api`. Database: `mongodb://127.0.0.1:27017/tempo`. The server binds to loopback. `GET /health` verifies the connection.

## Authentication contract

- `POST /auth/login` — `{email,password}`. Returns `{user,csrfToken}` and an HttpOnly `tempo_session` cookie. Sessions expire after 12 hours; token hashes, not raw tokens, are stored in MongoDB.
- Send `credentials: 'include'` with browser requests. Send `X-CSRF-Token: <csrfToken>` on every authenticated POST/PATCH/PUT request. Unauthenticated login/invitation/reset endpoints enforce allowed browser origins and rate limits.
- `GET /auth/me` — current safe user profile.
- `GET /auth/csrf` — rotates/returns the session CSRF token after reload. The client must use the latest token; older tabs must refresh it if rejected.
- `POST /auth/logout` — `{}`; revokes this session and clears the cookie.
- `POST /auth/change-password` — `{currentPassword,newPassword}`; optional at any time. Revokes all sessions, including the current one. Sign in again.
- Passwords use salted scrypt hashes. New passwords must contain 12–128 characters. No forced first-login password change.
- CORS defaults to both `localhost:5173` and `127.0.0.1:5173`. Use one hostname consistently for frontend/backend cookies. `NODE_ENV=production` requires HTTPS for Secure cookies. API responses use `Cache-Control: no-store`.

### Invitations and recovery without email

Admin creates a user with `POST /users`. The response includes `{user,invitation:{token,link,temporaryPassword,expiresAt,emailSent:false,message}}`. Credentials are returned once; hashes are stored. Admin must manually share them until email delivery is implemented. The link's fragment contains the token to avoid URL access-log exposure. The frontend accepts invitations at `/invite` and resets passwords at `/reset-password`, then removes the token from the address bar. Reopen the original link if the page is refreshed before completion.

`POST /auth/accept-invitation` with `{token,temporaryPassword}` activates the pending user and establishes a session. It does not change the password. Invitations expire in 7 days and cannot be reused. An inactive account cannot use normal login before accepting its invitation.

- `POST /users/:id/invitation` — Admin reissues a pending invitation, invalidating the old token and temporary password.
- `POST /users/:id/password-reset` — Admin obtains a one-hour reset token/link for an active user. No email is sent. Existing password remains usable until reset completes.
- `POST /auth/reset-password` — `{token,newPassword}`. Consumes the token and revokes all sessions. Admin-assisted recovery replaces a public forgotten-password email flow while email is excluded.

## Users and catalogs

All IDs are MongoDB ObjectId strings. List endpoints support `page` (default 1), `limit` (default 50, max 100) and literal `search`. Catalog list endpoints also accept `active=true|false|all` (default true).

| Endpoint | Access | Body / result |
|---|---|---|
| `GET /users`, `GET /users/:id` | Admin, Manager | Safe profiles; never passwords/tokens |
| `POST /users` | Admin | `{name,email,role,trackingStart?,trackingEnd?}`; role is Admin, Manager or User; `trackingStart` defaults to today (IST) |
| `PATCH /users/:id` | Admin | `{version,name?,role?,disabled?,trackingStart?,trackingEnd?}`; tracking dates are `YYYY-MM-DD` or `null` to clear; disabling without an end date sets `trackingEnd` to today |
| `GET /users/:id/history` | Admin | User audit events |
| `GET /clients`, `GET /clients/:id` | Admin, Manager | Client records |
| `POST /clients` | Admin | `{name}` |
| `PATCH /clients/:id` | Admin | `{version,name?,active?}` |
| `GET /tasks`, `GET /tasks/:id` | All signed-in users | Shared task catalog |
| `POST /tasks` | Admin, Manager | `{name}` |
| `PATCH /tasks/:id` | Admin, Manager | `{version,name?,active?}` |
| `GET /projects`, `GET /projects/:id` | All signed-in users | Users see only assigned projects; member lists/audit actors are omitted for Users |
| `POST /projects` | Admin, Manager | `{name,client,members:[userId]}` |
| `PATCH /projects/:id` | Admin, Manager | `{version,name?,client?,members?,active?}`; members replaces the assignment list |

Catalog records return `__v`; safe user profiles return `version`. Send that value as `version` on updates. Stale versions return 409. Empty arrays unassign everyone. Assigned accounts must exist and not be disabled; pending invitees can be assigned. Clients must be active when selected for a project.

Use `active:false` to archive a catalog record and `disabled:true` to disable a user. Historical records are preserved; hard deletion is not exposed. Role changes and account disabling immediately invalidate existing sessions. API administrator demotion/deactivation is intentionally disallowed to prevent administrative lockout; it requires a controlled offline operation. Ordinary User/Manager role changes are supported.

## Timesheets

Only the owner may create/edit/submit their time, regardless of role. Admin/Manager may inspect and review every user's timesheet, including their own. Users cannot list or fetch other users' sheets.

| Endpoint | Body / behavior |
|---|---|
| `GET /timesheets` | Pagination; optional `userId`, `status`, `weekStart`; managers/admins see all unless filtered |
| `GET /timesheets/current` | Current IST Monday and own existing sheet or null |
| `POST /timesheets` | `{weekStart:"YYYY-MM-DD",entries:[]}`; creates own Draft; duplicate user/week returns 409 |
| `GET /timesheets/:id` | Working entries, totals, deadline, late flag, `revision`, `approvals`, `lastApproved`, history, and `__v` |
| `PUT /timesheets/:id` | `{version,entries:[...]}`; replaces entries on own Draft/Rejected sheet |
| `POST /timesheets/:id/submit` | `{version}`; Draft/Rejected → Submitted; requires at least 40 hours |
| `POST /timesheets/:id/approve` | Admin/Manager, `{version}`; Submitted → Approved; appends an immutable approval revision |
| `POST /timesheets/:id/reject` | Admin/Manager, `{version,reason}`; Submitted → Rejected |
| `POST /timesheets/:id/reopen` | Admin only, `{version,reason}`; Approved → Draft as revision N+1; earlier approvals are kept |

Each entry is `{date,project,task,description,hours}`. Multiple entries on the same date are supported. Dates must fall within the sheet's Monday–Sunday week. Hours must be positive with up to two decimals; there is no daily/weekly business maximum. Descriptions are required. Empty drafts are allowed. A request supports up to 1,000 entries and a 1 MB JSON body as transport safeguards.

User entries must reference active assigned projects; Admin/Manager may select any active project. Tasks are shared and must be active. References and assignments are checked again on submission. Removing an assignment never erases historical reports.

The minimum is 40 hours. The deadline is Sunday 23:59:59.999 in Asia/Kolkata. Submission at/after Monday 00:00 IST is allowed with `late:true`. Resubmissions follow the same rule. Submitted/Approved sheets are locked; only Admin can reopen Approved sheets. Version checks make competing reviews/edits fail with 409 rather than silently overwrite. History is embedded in the same document and saved atomically with the workflow transition.

### Approval revisions

Each sheet has a `revision` number (starting at 1). Approving revision N appends `{revision, entries, totalHours, entryCount, approvedBy, approvedByName, approvedAt, submittedAt, late}` to `approvals` and copies it to `lastApproved`. Snapshot entries also carry the project, client and task names as they were at approval, so later renames and archiving don't alter them. Reopening starts revision N+1 as a Draft whose working entries begin as a copy of revision N; `approvals` is never modified.

The approval snapshot, status change and audit event are written in one versioned update to the timesheet document. MongoDB single-document writes are atomic, so this needs no replica set or transaction. The model refuses any save that changes, removes or reorders an existing approval, adds more than one per save, or lets `lastApproved` diverge from the newest approval. Query updates that touch `approvals`/`lastApproved`, pipeline updates, replacements and deletions of timesheets are refused. Writes through the raw MongoDB driver or shell bypass these guards; restrict database credentials accordingly.

Audit events carry `revision`. `edited` events store `changes: {totalBefore, totalAfter, addedCount, removedCount, added, removed}` (full rows only when 100 or fewer change; otherwise `truncated: true` with counts). `reopened` events store `changes.fromRevision`.

Existing Approved sheets created before this change have no snapshot. Run `npm run migrate:approvals` once; it is idempotent and reports any sheets reopened before migration, whose earlier approved content cannot be recovered. The API logs a warning at startup while unsnapshotted approved sheets exist, and reopening such a sheet returns 409 until migrated.

## Missing and overdue timesheets

`GET /compliance` returns derived indicators; nothing is stored and no timesheet status is added. Query: `from`, `to` (Mondays; default the 12 most recent weeks whose deadline has passed; at most 53 weeks), `userId`, `indicator=Missing|Overdue`, `page`, `limit`. Users see only themselves; Admin/Manager see everyone.

- A user is **expected** for a week only when the whole Monday–Sunday week lies within `[trackingStart, trackingEnd]` (inclusive IST dates). Users with no `trackingStart` are never expected. Partial first/last weeks are not expected, though the user may still submit them.
- Only weeks whose Sunday 23:59:59 IST deadline has passed are evaluated; `to` is capped at the last such week.
- **Missing**: expected and no timesheet exists. **Overdue**: a timesheet exists, is Draft or Rejected, and has never been approved. Reopened sheets (which have an approved revision) are not overdue.

Returns `{from,to,items:[{userId,userName,role,disabled,weekStart,deadline,indicator,sheetId?,status?}],total,counts:{missing,overdue},page,limit,timezone}`, newest week first.

## Reports

`GET /reports` accepts:

- `period=this-week|last-week|this-month|last-month|custom`
- `start=YYYY-MM-DD&end=YYYY-MM-DD` for custom, inclusive and ordered
- `userId` (Admin/Manager can choose anyone; Users can only choose themselves)
- `basis=approved|working` (default `approved`)
- `projectId`, `page`, `limit`; `status` only with `basis=working`

Returns `range`, `timezone`, `totals`, `byProject`, `byTask`, `byUser`, `byStatus`, `byDate`, and paginated detailed `items`. Group `_id` values refer to catalog/user IDs; detail rows include names. Totals and grouped summaries cover the complete selected range, independent of pagination. Filters apply by entry date, including partial weeks crossing month/year boundaries. With `basis=approved`, rows come from each sheet's `lastApproved` revision only; never-approved sheets are excluded and reopened sheets keep reporting their last approved revision until re-approved. Rows include `revision` and `approvedAt`. `pending: {awaitingApproval, underCorrection}` counts Submitted sheets and sheets with an earlier approval that are currently not Approved. `unapproved: {totals: {hours, entries, sheets}, byStatus: [{_id, hours, entries, sheets}]}` (basis=approved only) summarises working entries of sheets not currently Approved (Submitted, Rejected, Draft, including reopened sheets' working copies); these hours are never included in `totals`. With `basis=working`, rows come from current working entries of all statuses (optionally filtered by `status`).

`GET /reports/export` accepts the same filters and streams all matching rows as CSV with `Revision`, `Approved at` and `Basis` columns (pagination parameters do not limit exports). CSV cells are quoted and formula-leading characters are neutralized. Historical archived projects/tasks remain reportable.

## Errors and testing

JSON errors use `{error,details?}`: 400 invalid input/rules, 401 missing/expired session, 403 permission/CSRF/origin failure, 404 missing or inaccessible record, 409 duplicate/stale/invalid transition, 429 rate limit. Unexpected errors return a generic 500 and are logged server-side without request bodies.

```powershell
npm run check
npm test
```

Tests start a temporary HTTP server and use a uniquely named `tempo_test_*` database, deleting only that database afterward. They require local MongoDB. `TEST_MONGODB_URI` can select another MongoDB host; tests always override the database name. App data is untouched.

The service uses single-document atomic writes and optimistic concurrency, so local standalone MongoDB is supported without replica-set transactions. Rate limiting currently uses process memory; use a shared rate-limit store and deployment-specific network/TLS configuration before running multiple instances.
