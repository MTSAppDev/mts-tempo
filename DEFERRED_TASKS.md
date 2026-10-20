# Deferred tasks and review backlog

Updated: 2026-10-20. These items are recorded for future work; recording them does not implement a fix.

## Deferred

### D1 — Preserve previously accepted entries during edit/resubmit (P4)

- Original review issue #2. Saves and submissions validate all entries against current active projects, tasks and project membership. Archiving a catalog item or removing membership can block a Draft, Rejected or reopened sheet containing legitimate historical hours.
- Agreed direction: preserve unchanged, previously accepted entries and validate new or changed entries, or introduce assignments effective for the work date. Define which changes require renewed validation before implementing.
- Acceptance: historical unchanged entries survive archival/removal and can be resubmitted; new unauthorized entries remain blocked. Submitted and Approved sheets stay locked until the existing workflow permits editing.

### D2 — Control embedded audit history growth (P4)

- The approved-revision preservation fix for original issue #1 is complete. This remaining item concerns storage growth only: repeated edits and approval cycles append history/snapshots inside the timesheet document.
- Consider a separate append-only audit/revision collection and paginated history reads when usage warrants it. Preserve all approved revisions and required audit evidence.
- Acceptance: many edits do not grow the main timesheet document without bound; approval snapshots and audit history remain retrievable and immutable.

### D3 — Align report pending counts with entry filters (P3)

- Pending sheet counts use the user/week scope but do not apply the selected project or exact entry-date range. Counts can therefore refer to sheets with no entries in the displayed report.
- Apply matching entry filters when counting sheets, or explicitly label these counts as a broader weekly scope.
- Acceptance: a project filter and a custom date range produce counts consistent with their documented scope; count each matching sheet once.

### D4 — Make the unapproved report link show the displayed entries (P3)

- The "View these entries" link changes the basis to working copies but retains the previous status selection. It can show approved entries or an unrelated status rather than the unapproved entries summarized in the section.
- Provide an explicit unapproved filter (or a status-specific drill-down) and preserve the other report filters. Clearing status alone would still include Approved working copies.
- Acceptance: the linked entries match the unapproved summary across Draft, Submitted and Rejected sheets, even after a previous status filter was selected.

## New finding — pending prioritization

### R4 — Show missing weekly submissions (original review issue #4)

- Confirmed: a timesheet exists only after creation/save. Listing and reporting query existing sheets, and the late flag is calculated only when a sheet is submitted. An eligible user with no sheet for a week is absent from manager tracking. Existing Draft sheets can be listed, but are not automatically identified as overdue through the late flag.
- Proposed direction: derive expected user/week pairs and compare them with existing sheets. Give Managers/Admins a missing-submission view, with overdue determined after the Sunday deadline in Asia/Kolkata (Monday 00:00 IST). Keep missing/overdue indicators separate from the four persisted timesheet statuses and from the approval queue.
- Define eligibility before implementation: when a user's obligation starts/ends, how pending invitations and disabled accounts affect it, and any exemptions. Current account state alone is insufficient for reliable historical eligibility.
- Acceptance: an eligible user who never opens the app appears for the selected overdue week; an unsubmitted Draft is also visible; a subsequent submission clears the missing-submission indicator and retains its late flag. Before-deadline weeks are not marked overdue. Historical views follow the agreed eligibility rules and role permissions.
- No fix or priority has been agreed for this new finding yet.
