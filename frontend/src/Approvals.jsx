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
  useEffect(() => {
    if (status === "Missing") return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    api(`/timesheets?status=${status}&page=${page}&limit=20`, {
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
  }, [status, page, reload]);
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
      {status === "Missing" ? (
        <Compliance user={user} />
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
                  <span className="muted">All team members</span>
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
