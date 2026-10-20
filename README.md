# Tempo — time tracking

A React frontend connected to an Express/MongoDB backend. Authentication, permissions, catalogs, assignments, timesheets, approvals, reporting and invitations work against MongoDB. Email sending is excluded; Admins share invitation and password-reset details manually.

Known deferred work and review findings are tracked in [DEFERRED_TASKS.md](DEFERRED_TASKS.md).

## Start locally

Start MongoDB, then run the backend in one terminal:

```powershell
cd backend
npm install
# First installation only, if no Admin exists:
npm run setup
npm run dev
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` and sign in with the Admin account you created. The frontend proxies `/api` to the backend on port 4000 so session cookies use the same origin. `npm run build` creates a production frontend build; `npm run preview` serves it locally with the same proxy. `API_PROXY_TARGET` overrides the backend target for local development/preview.

## Included workflows

- Real login, session restoration, logout, invitation acceptance, optional password changes and Admin-assisted password reset.
- Admin, Manager and User navigation based on the authenticated role; the backend enforces every permission.
- Monday–Sunday timesheets with multiple project/task rows per day, descriptions, hours, validation, explicit draft saving to MongoDB and submission.
- Draft, Submitted, Rejected and Approved states. Submitted/approved sheets are locked; rejected sheets may be edited and resubmitted.
- Manager/Admin reviews, entry details, approval and rejection with feedback.
- Reports for this week, last week, this month, last month and custom dates; user selection for managers/admins, own reports for users, project summaries and CSV export.
- Project creation/editing and team assignment; shared task creation/editing; Admin-only client and user creation.
- Archive/restore projects, tasks and clients; update User/Manager roles and disable accounts.
- Admin-only reopening of approved timesheets with an audit reason; rejection feedback and workflow activity.
- Users see assigned projects in time entry. Managers/Admins see all projects and users through project assignments/report filters.
- Responsive desktop and mobile layouts.

All workspace records live in MongoDB. The old demo `tempo-v1` localStorage key is no longer read or written; no demo records are imported. Unsaved edits stay in memory, and navigation/reload warns before leaving them. Weekly dates and reporting presets use the current IST calendar. Invitation/reset credentials appear only in their Admin dialog and are not stored in browser storage. No email is sent.

Suggested first-use order: create a client, create shared tasks, invite users, create projects and assign users. Copy the invitation link and temporary password before closing the invitation dialog. Users accept the invitation at that link and can optionally change their password in Account. Admins can reissue pending invitations or create password-reset links from Team → Manage.

## Backend

The backend implements the confirmed rules in [REQUIREMENTS.md](REQUIREMENTS.md): IST Monday–Sunday weeks, a minimum of 40 hours to submit, late submissions flagged, no maximum hours, shared tasks, Manager/Admin approvals including self-approval, and Admin-only reopening.

```powershell
cd backend
npm install
# Copy .env.example to .env only if .env does not exist.
npm run setup
# Once, if the database already has approved timesheets from before approval revisions:
npm run migrate:approvals
npm run dev
```

Local MongoDB is configured through `backend/.env`. `npm run setup` creates the first Admin with a hidden password prompt. The API listens at `http://127.0.0.1:4000/api` and has no default password. See [backend/API.md](backend/API.md) for every endpoint, request shape, permissions, session/CSRF handling and setup details.

## Validation

```powershell
cd backend
npm run check
npm test
```

Integration tests run real HTTP requests against an isolated, disposable MongoDB database. They cover permissions, invitation expiry/replay, optional password changes, session revocation, concurrent reviews, input validation, archival history, report boundaries and CSV exports.

Frontend build and browser tests:

```powershell
cd frontend
npm run build
npm run test:e2e
```

Browser tests use installed Microsoft Edge, isolated servers on ports 4005/5175, and a disposable `tempo_ui_test_*` MongoDB database. They do not write to `tempo`. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome instead. Screenshots and failure traces are written to ignored `frontend/test-results/`.

## Remaining deployment work

Email-provider integration and production hosting are not included. Configure HTTPS, the same-origin `/api` reverse proxy, backups, and a shared rate-limit store if deploying multiple backend instances. Production hosting must serve the React entry point for `/invite` and `/reset-password` routes. Current development runs locally.
