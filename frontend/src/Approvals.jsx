import React, { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api, mutation } from "./api";
import { nice, addDays, nameOf, initials, stamp } from "./lib";
import Compliance from "./Compliance";
import {
  Heading,
  ErrorBox,
  Loading,
  Empty,
  Pagination,
  Status,
  Modal,
} from "./ui";
export default function Approvals({ user, data, notify }) {
  const [status, setStatus] = useState("Submitted"),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const [filters, setFilters] = useState({ userId: "", start: "", end: "" });
  const rangeError = filters.start && filters.end && filters.start > filters.end
    ? "Start date must be on or before end date." : "";
  function changeFilter(name, value) {
    setFilters((previous) => ({ ...previous, [name]: value }));
    setPage(1);
  }
  useEffect(() => {
    if (status === "Missing" || rangeError) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status, page: String(page), limit: "20" });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    api(`/timesheets?${params}`, {
      signal: c.signal,
    })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [status, page, reload, filters, rangeError]);
  async function action(e) {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      const f = new FormData(e.currentTarget);
      await mutation(`/timesheets/${modal.sheet._id}/${modal.action}`, {
        version: modal.sheet.__v,
        ...(modal.action !== "approve" ? { reason: f.get("reason") } : {}),
      });
      setModal(null);
      setReload((n) => n + 1);
      notify("Timesheet updated.");
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(false);
    }
  }
  function open(sheet, action) {
    setActionError("");
    setModal({ sheet, action });
  }
  return (
    <>
      <Heading
        title="Approvals"
        description="Review the work. Keep your team moving forward."
      />
      <div className="approval-filters card">
        <label>
          Team member
          <select aria-label="Team member" value={filters.userId} onChange={(e) => changeFilter("userId", e.target.value)}>
            <option value="">All team members</option>
            {data.users.map((person) => (
              <option key={person.id} value={person.id}>{person.name} ({person.email})</option>
            ))}
          </select>
        </label>
        <label>
          Start date
          <input type="date" value={filters.start} onChange={(e) => changeFilter("start", e.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={filters.end} onChange={(e) => changeFilter("end", e.target.value)} />
        </label>
        <button className="button outline" onClick={() => { setFilters({ userId: "", start: "", end: "" }); setPage(1); }}>
          Clear filters
        </button>
        <p className="form-note">Shows whole timesheet weeks overlapping these dates. Filters stay applied when you switch status.</p>
      </div>
      <div className="tabs" role="group" aria-label="Timesheet status">
        {["Submitted", "Approved", "Rejected", "Draft", "Missing"].map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            className={status === s ? "selected" : ""}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {s === "Missing" ? "Missing & overdue" : s}
          </button>
        ))}
      </div>
      {rangeError ? <ErrorBox error={rangeError} /> : status === "Missing" ? (
        <Compliance key={`${filters.userId}|${filters.start}|${filters.end}`} user={user} filters={filters} />
      ) : (
        <>
          <ErrorBox error={error} retry={() => setReload((x) => x + 1)} />
          {loading ? (
            <Loading />
          ) : (
            !error && (
              <section className="card list-card">
                <div className="section-title">
                  <h2>
                    {status === "Submitted"
                      ? "Awaiting your review"
                      : `${status} timesheets`}{" "}
                    <span className="count">{result?.total || 0}</span>
                  </h2>
                  <span className="muted">{filters.userId ? nameOf(data.users, filters.userId, "Selected team member") : "All team members"}</span>
                </div>
                {result?.items.length ? (
                  result.items.map((s) => {
                    const person = nameOf(data.users, s.user, "Team member");
                    return (
                      <div className="approval" key={s._id}>
                        <span className="avatar">{initials(person)}</span>
                        <div className="grow">
                          <h3>
                            {person}{" "}
                            {s.user === user.id && (
                              <span className="muted">(you)</span>
                            )}
                          </h3>
                          <p>
                            {nice(s.weekStart)} –{" "}
                            {nice(addDays(s.weekStart, 6))},{" "}
                            {s.weekStart.slice(0, 4)} ·{" "}
                            {s.totalHours.toFixed(2)} hours{" "}
                            {s.late && <span className="late-badge">Late</span>}
                            {s.revision > 1 && ` · Revision ${s.revision}`}
                            {s.lastApproved &&
                              s.status !== "Approved" &&
                              ` · last approved: rev ${s.lastApproved.revision}, ${s.lastApproved.totalHours.toFixed(2)} hrs`}
                          </p>
                          <details>
                            <summary>
                              Review {s.entries.length} entries & activity
                            </summary>
                            <div className="review-entries">
                              {s.entries.map((r) => (
                                <p key={r._id}>
                                  {nice(r.date)} ·{" "}
                                  {nameOf(
                                    data.projects,
                                    r.project,
                                    "Historical project",
                                  )}{" "}
                                  ·{" "}
                                  {nameOf(
                                    data.tasks,
                                    r.task,
                                    "Historical task",
                                  )}
                                  <br />
                                  {r.description} · <b>{r.hours} hrs</b>
                                </p>
                              ))}
                            </div>
                            {s.rejectionReason && (
                              <p>
                                <b>Feedback:</b> {s.rejectionReason}
                              </p>
                            )}
                            {s.history.map((h, i) => (
                              <p key={i} className="muted">
                                {h.action}
                                {h.revision
                                  ? ` · rev ${h.revision}`
                                  : ""} · {stamp(h.at)}{" "}
                                {h.detail && `· ${h.detail}`}
                              </p>
                            ))}
                          </details>
                        </div>
                        {s.status === "Submitted" ? (
                          <>
                            <button
                              className="button outline"
                              onClick={() => open(s, "reject")}
                            >
                              Reject
                            </button>
                            <button
                              className="button primary"
                              onClick={() => open(s, "approve")}
                            >
                              <Check size={16} />
                              Approve
                            </button>
                          </>
                        ) : s.status === "Approved" && user.role === "Admin" ? (
                          <button
                            className="button outline"
                            onClick={() => open(s, "reopen")}
                          >
                            Reopen
                          </button>
                        ) : (
                          <Status value={s.status} />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Empty text={`No ${status.toLowerCase()} timesheets.`} />
                )}
                <Pagination
                  page={page}
                  total={result?.total || 0}
                  onChange={setPage}
                />
              </section>
            )
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal.action === "approve"
              ? "Approve this timesheet?"
              : modal.action === "reject"
                ? "Request an update"
                : "Reopen this timesheet"
          }
          busy={busy}
          close={() => setModal(null)}
        >
          <p>
            {nameOf(data.users, modal.sheet.user)} · {modal.sheet.totalHours}{" "}
            hours · Week of {nice(modal.sheet.weekStart)}
          </p>
          <ErrorBox error={actionError} />
          <form onSubmit={action}>
            <fieldset disabled={busy}>
              {modal.action !== "approve" && (
                <label>
                  {modal.action === "reject"
                    ? "Feedback for your teammate"
                    : "Reason for reopening"}
                  <textarea name="reason" required maxLength={2000} />
                </label>
              )}
              <button className="button primary full-width">
                {busy
                  ? "Updating…"
                  : modal.action === "approve"
                    ? "Confirm approval"
                    : modal.action === "reject"
                      ? "Reject timesheet"
                      : "Reopen for editing"}
              </button>
            </fieldset>
          </form>
          {actionError?.status === 409 && (
            <button
              className="text-button"
              onClick={() => {
                setModal(null);
                setReload((n) => n + 1);
              }}
            >
              Close and reload the latest version
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
