# Confirmed business rules

- Local development first, using MongoDB, Express, React and Node.js.
- Admin: create users, clients, projects and shared tasks; assign users to projects; view all users and reports; approve all timesheets; reopen approved timesheets.
- Manager: create projects and shared tasks; assign users to projects; view all users and reports; approve any user's timesheet.
- Managers and Admins may approve their own timesheets.
- User: enter/submit own time, view own reports, select only assigned projects and any shared task. No access to other users.
- Tasks are shared across all projects.
- Week runs Monday through Sunday in Asia/Kolkata (IST).
- Minimum weekly target: 40 hours. Submission deadline: Sunday (interpret as end of Sunday in IST).
- No maximum hours limit. The prototype's existing 24-hour cap must be removed during implementation.
- Multiple rows per date support different projects or tasks within the same project.
- Statuses: Draft, Submitted, Rejected, Approved. Only Admin may reopen an approved sheet for editing; retain an audit record.
- Invitations include a sign-in link and temporary password. Password change is optional; include a recommendation in the invitation email. Do not enforce first-login password change.
- Reports: this week, last week, this month, last month, custom inclusive start/end dates. Admin/Manager may filter any user; User sees only self.

## Confirmed submission policy

- At least 40 hours are required to submit, including resubmissions.
- Late submissions are allowed and flagged using midnight at the end of Sunday in IST.
- Rejected/reopened sheets can be resubmitted after the deadline and receive the late flag.

The backend and connected React frontend implement these rules. Email delivery is excluded; invitation and reset links are shared manually by Admin.
