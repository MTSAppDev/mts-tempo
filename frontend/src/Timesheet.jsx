import React, { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderKanban,
  CheckCheck,
  Plus,
  Copy,
  X,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { api, mutation } from "./api";
import {
  days,
  currentWeek,
  addDays,
  nice,
  istToday,
  hours,
  entryPayload,
  nameOf,
  stamp,
} from "./lib";
import { ErrorBox, Loading, Stat, Status, Heading } from "./ui";
export default function Timesheet({
  user,
  data,
  setDirty,
  dirty,
  notify,
  viewReport,
  setWorking,
}) {
  const [week, setWeek] = useState(currentWeek),
    [sheet, setSheet] = useState(null),
    [rows, setRows] = useState([]),
    [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [attention, setAttention] = useState(null);
  const seq = useRef(0);
  const current = currentWeek();
  useEffect(() => {
    const control = new AbortController(),
      ticket = ++seq.current;
    setLoading(true);
    setLoaded(false);
    setError("");
    api(`/timesheets?userId=${user.id}&weekStart=${week}`, {
      signal: control.signal,
    })
      .then((result) => {
        if (seq.current !== ticket) return;
        const value = result.items[0] || null;
        setLoaded(true);
        setSheet(value);
        setRows(value?.entries.map((row) => ({ ...row, key: row._id })) || []);
        setDirty(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (seq.current === ticket && !control.signal.aborted)
          setLoading(false);
      });
    return () => control.abort();
  }, [week, reload, user.id]);
  // Own Missing / Overdue weeks (past the Sunday IST deadline); refreshed whenever this sheet changes.
  useEffect(() => {
    const control = new AbortController();
    api(`/compliance?userId=${user.id}&limit=10`, { signal: control.signal })
      .then(setAttention)
      .catch(() => {});
    return () => control.abort();
  }, [user.id, sheet?._id, sheet?.__v]);
  const status = sheet?.status || "Draft",
    editable = ["Draft", "Rejected"].includes(status),
    projects = data.projects.filter((x) => x.active),
    tasks = data.tasks.filter((x) => x.active),
    total = hours(rows);
  const edit = (next) => {
    setRows(next);
    setDirty(true);
  };
  const move = (value) => {
    if (
      busy ||
      (dirty && !window.confirm("Discard unsaved timesheet changes?"))
    )
      return;
    setDirty(false);
    setWeek(value);
  };
  const reloadSheet = () => {
    if (busy) return;
    if (
      !dirty ||
      window.confirm(
        "Discard your unsaved changes and load the latest version?",
      )
    ) {
      setDirty(false);
      setReload((x) => x + 1);
    }
  };
  function add(day) {
    if (!projects.length || !tasks.length) return;
    edit([
      ...rows,
      {
        key: crypto.randomUUID(),
        date: addDays(week, day),
        project: projects[0]._id,
        task: tasks[0]._id,
        description: "",
        hours: "",
      },
    ]);
  }
  function patch(key, changes) {
    edit(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }
  function copyPreviousDay(day) {
    if (!editable || busy || day === 0) return;
    const previous = rows.filter((r) => r.date === addDays(week, day - 1));
    if (!previous.length || rows.length + previous.length > 1000) return;
    edit([
      ...rows,
      ...previous.map((r) => ({
        key: crypto.randomUUID(),
        date: addDays(week, day),
        project: r.project,
        task: r.task,
        description: r.description,
        hours: r.hours,
      })),
    ]);
    notify(`Copied ${previous.length} ${previous.length === 1 ? "entry" : "entries"} from ${days[day - 1]}. Save draft to keep your changes.`);
  }
  async function save(submit = false) {
    setError("");
    setBusy(true);
    setWorking(true);
    try {
      const entries = entryPayload(rows);
      if (submit && hours(entries) < 40)
        throw new Error(
          "At least 40 hours are required to submit this week. You can save a draft at any time.",
        );
      let saved = sheet;
      if (!sheet || dirty) {
        saved = await mutation(
          sheet ? `/timesheets/${sheet._id}` : "/timesheets",
          sheet
            ? { version: sheet.__v, entries }
            : { weekStart: week, entries },
          sheet ? "PUT" : "POST",
        );
        setSheet(saved);
        setRows(saved.entries.map((r) => ({ ...r, key: r._id })));
        setDirty(false);
      }
      if (submit) {
        saved = await mutation(`/timesheets/${saved._id}/submit`, {
          version: saved.__v,
        });
        setSheet(saved);
      }
      notify(
        submit ? "Timesheet submitted for review." : "Draft Saved",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setWorking(false);
    }
  }
  return (
    <>
      <Heading
        title="My timesheet"
        description="A little progress, every day. Track the work that matters."
      >
        <button className="button outline" onClick={viewReport}>
          <BarChart3 size={16} />
          View my report
        </button>
      </Heading>
      <ErrorBox error={error} retry={reloadSheet} />
      {loading ? (
        <Loading />
      ) : !loaded ? null : (
        <>
          <div className="stats">
            <Stat
              label="HOURS THIS WEEK"
              value={total.toFixed(2)}
              suffix="hrs"
              icon={Clock3}
              foot={`${Math.round((total / 40) * 100)}% of 40-hour minimum`}
              progress={(total / 40) * 100}
            />
            <Stat
              label="PROJECTS WORKED ON"
              value={new Set(rows.map((r) => r.project)).size
                .toString()
                .padStart(2, "0")}
              icon={FolderKanban}
              foot="A little focus. A lot of impact."
            />
            <Stat
              label="TIMESHEET STATUS"
              value={<Status value={status} />}
              icon={CheckCheck}
              foot={
                sheet?.late
                  ? "Submitted after the Sunday deadline"
                  : "Weekly deadline: Sunday, 11:59 PM IST"
              }
            />
          </div>
          {sheet?.lastApproved && status !== "Approved" && (
            <div className="info-box">
              <strong>Revision {sheet.revision} in progress.</strong> Approved
              revision {sheet.lastApproved.revision} (
              {sheet.lastApproved.totalHours.toFixed(2)} hrs, approved by{" "}
              {sheet.lastApproved.approvedByName} on{" "}
              {stamp(sheet.lastApproved.approvedAt)}) stays the official record
              until this revision is approved.
            </div>
          )}
          {attention?.total > 0 && (
            <div className="info-box attention-box">
              <strong>
                {attention.total} past week{attention.total === 1 ? "" : "s"}{" "}
                need{attention.total === 1 ? "s" : ""} a timesheet:
              </strong>{" "}
              {attention.items.map((i) => (
                <button
                  key={i.weekStart}
                  className="text-button"
                  disabled={busy}
                  onClick={() => move(i.weekStart)}
                >
                  {nice(i.weekStart)} ({i.indicator})
                </button>
              ))}
              {attention.total > attention.items.length && " …"}
            </div>
          )}
          {sheet?.rejectionReason && (
            <div className="info-box">
              <strong>Changes requested:</strong> {sheet.rejectionReason}
            </div>
          )}
          {editable && (!projects.length || !tasks.length) && (
            <div className="info-box">
              {!projects.length
                ? "No active projects available. Ask your Admin or Manager to assign you to a project."
                : "No active tasks available. Ask your Admin or Manager to create a shared task."}
            </div>
          )}
          <section className="timesheet card">
            <div className="week-toolbar">
              <div className="week-title">
                <div className="calendar-icon">
                  <CalendarDays size={20} />
                </div>
                <div>
                  <h2>
                    {nice(week)} – {nice(addDays(week, 6))}, {week.slice(0, 4)}
                  </h2>
                  <p>
                    Monday – Sunday · IST{" "}
                    <span className="week-tag">
                      {week === current ? "This week" : "Weekly timesheet"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="week-nav">
                <button
                  disabled={busy}
                  aria-label="Previous week"
                  onClick={() => move(addDays(week, -7))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button disabled={busy} onClick={() => move(current)}>
                  Today
                </button>
                <button
                  disabled={busy}
                  aria-label="Next week"
                  onClick={() => move(addDays(week, 7))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="table-head">
              <span>DAY / DATE</span>
              <span>PROJECT & TASK</span>
              <span>DESCRIPTION</span>
              <span>HOURS</span>
              <span />
            </div>
            {days.map((day, i) => {
              const dayRows = rows.filter((r) => r.date === addDays(week, i));
              const previousCount = i > 0
                ? rows.filter((r) => r.date === addDays(week, i - 1)).length
                : 0;
              return (
                <div
                  className={`day-group ${i > 4 ? "weekend" : ""}`}
                  key={day}
                >
                  <div className="day-label">
                    <b>
                      {day}
                      {addDays(week, i) === istToday() && (
                        <i className="today-dot" />
                      )}
                    </b>
                    <span>{nice(addDays(week, i))}</span>
                    {dayRows.length > 0 && (
                      <small>{hours(dayRows).toFixed(2)} hrs</small>
                    )}
                  </div>
                  <div className="day-entries">
                    {dayRows.map((r, index) => (
                      <div className="entry" key={r.key}>
                        <div className="project-task">
                          <select
                            aria-label={`${day} project ${index + 1}`}
                            disabled={!editable || busy}
                            value={r.project}
                            onChange={(e) =>
                              patch(r.key, { project: e.target.value })
                            }
                          >
                            {!projects.some((p) => p._id === r.project) && (
                              <option value={r.project}>
                                {nameOf(
                                  data.projects,
                                  r.project,
                                  "Unavailable project",
                                )}{" "}
                                — choose another
                              </option>
                            )}
                            {projects.map((p) => (
                              <option key={p._id} value={p._id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`${day} task ${index + 1}`}
                            disabled={!editable || busy}
                            value={r.task}
                            onChange={(e) =>
                              patch(r.key, { task: e.target.value })
                            }
                          >
                            {!tasks.some((t) => t._id === r.task) && (
                              <option value={r.task}>
                                {nameOf(data.tasks, r.task, "Unavailable task")}{" "}
                                — choose another
                              </option>
                            )}
                            {tasks.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          className="description"
                          aria-label={`${day} description ${index + 1}`}
                          disabled={!editable || busy}
                          maxLength={2000}
                          placeholder="What did you work on?"
                          value={r.description}
                          onChange={(e) =>
                            patch(r.key, { description: e.target.value })
                          }
                        />
                        <input
                          className="hours"
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]{0,2}"
                          aria-label={`${day} hours ${index + 1}`}
                          disabled={!editable || busy}
                          value={r.hours}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
                              patch(r.key, { hours: value });
                            }
                          }}
                        />
                        {editable ? (
                          <button
                            disabled={busy}
                            className="delete-row"
                            aria-label={`Remove ${day} entry ${index + 1}`}
                            onClick={() =>
                              edit(rows.filter((x) => x.key !== r.key))
                            }
                          >
                            <X size={15} />
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                    {editable ? (
                      <div className="day-entry-actions">
                      <button
                        className={`add-entry ${!dayRows.length ? "empty-entry" : ""}`}
                        disabled={busy || !projects.length || !tasks.length}
                        aria-label={`Add time ${day}`}
                        onClick={() => add(i)}
                      >
                        <Plus size={15} />
                        Add time
                        <span>
                          {!dayRows.length &&
                            (i > 4
                              ? "Enjoy your weekend, or log a little extra."
                              : "Start something good.")}
                        </span>
                      </button>
                      {i > 0 && (
                        <button
                          className="copy-day"
                          aria-label={`Copy ${days[i - 1]} entries to ${day}`}
                          title={`Append all ${days[i - 1]} entries to ${day}`}
                          disabled={busy || !previousCount || rows.length + previousCount > 1000}
                          onClick={() => copyPreviousDay(i)}
                        >
                          <Copy size={15} />
                          Copy previous day
                        </button>
                      )}
                      </div>
                    ) : (
                      !dayRows.length && (
                        <div className="empty-entry muted">No time logged</div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            <div className="week-total">
              <span>
                Weekly total <small>{rows.length} time entries</small>
              </span>
              <strong>
                {total.toFixed(2)} <small>hrs</small>
              </strong>
            </div>
          </section>
          <div className="timesheet-action-error">
            <ErrorBox error={error} />
          </div>
          <div className="sheet-footer">
            <span>
              <span className={`saved-dot ${dirty ? "unsaved" : ""}`} />
              {dirty
                ? "Unsaved changes"
                : sheet
                  ? "Saved to your workspace"
                  : "No entries saved yet"}
            </span>
            {editable ? (
              <div>
                <button
                  disabled={busy}
                  className="button outline"
                  onClick={() => save(false)}
                >
                  {busy ? "Saving…" : "Save draft"}
                </button>
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() => save(true)}
                >
                  Submit timesheet
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <span>
                Read-only ·{" "}
                {status === "Approved"
                  ? "An Admin can reopen this timesheet."
                  : "Awaiting review."}
              </span>
            )}
          </div>
          {sheet?.history?.length > 0 && (
            <details className="history">
              <summary>Timesheet activity</summary>
              {[...sheet.history].reverse().map((event, i) => (
                <p key={i}>
                  <b>{event.action}</b>
                  {event.revision ? ` · rev ${event.revision}` : ""} ·{" "}
                  {stamp(event.at)} {event.detail && `· ${event.detail}`}
                </p>
              ))}
            </details>
          )}
          {sheet?.approvals?.length > 0 && (
            <details className="history">
              <summary>Approved revisions ({sheet.approvals.length})</summary>
              {[...sheet.approvals].reverse().map((a) => (
                <p key={a.revision}>
                  <b>Revision {a.revision}</b> · {a.totalHours.toFixed(2)} hrs ·{" "}
                  {a.entryCount} entries · approved by {a.approvedByName} ·{" "}
                  {stamp(a.approvedAt)}
                  {a.migrated ? " · migrated" : ""}
                </p>
              ))}
            </details>
          )}
          <div className="bottom-note">
            <Clock3 size={14} />
            40-hour minimum · No maximum · Late submissions are flagged
          </div>
        </>
      )}
    </>
  );
}
