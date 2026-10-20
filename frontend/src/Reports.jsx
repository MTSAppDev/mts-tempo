import React, { useEffect, useState } from "react";
import { Download, Clock3, CheckCheck, FolderKanban } from "lucide-react";
import { api } from "./api";
import { currentWeek, addDays, nice, nameOf } from "./lib";
import {
  Heading,
  ErrorBox,
  Loading,
  Empty,
  Pagination,
  Stat,
  Status,
} from "./ui";
const periods = [
  ["this-week", "This week"],
  ["last-week", "Last week"],
  ["this-month", "This month"],
  ["last-month", "Last month"],
  ["custom", "Custom range"],
];
export default function Reports({ user, data, own = false }) {
  const [period, setPeriod] = useState("this-week"),
    [userId, setUserId] = useState(own ? user.id : ""),
    [start, setStart] = useState(currentWeek),
    [end, setEnd] = useState(() => addDays(currentWeek(), 6)),
    [basis, setBasis] = useState("approved"),
    [status, setStatus] = useState(""),
    [projectId, setProjectId] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [exportError, setExportError] = useState(""),
    [exporting, setExporting] = useState(false),
    [reload, setReload] = useState(0);
  const invalid = period === "custom" && (!start || !end || start > end);
  const params = new URLSearchParams({
    basis,
    period,
    page: String(page),
    limit: "20",
    ...(period === "custom" ? { start, end } : {}),
    ...(user.role !== "User" && userId ? { userId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(basis === "working" && status ? { status } : {}),
  }).toString();
  useEffect(() => {
    if (invalid) {
      setResult(null);
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    setError("");
    setExportError("");
    api(`/reports?${params}`, { signal: c.signal })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [params, invalid, reload]);
  function filter(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(1);
    };
  }
  async function download() {
    setExporting(true);
    setExportError("");
    try {
      const blob = await api(`/reports/export?${params}`, { blob: true });
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `tempo-report-${result.range.start}-${result.range.end}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <Heading
        title="Reports"
        description="Turn tracked time into a clearer picture."
      >
        <button
          className="button outline"
          disabled={loading || invalid || !!error || exporting || !result}
          onClick={download}
        >
          <Download size={16} />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </Heading>
      <div className="card filters">
        {user.role !== "User" && (
          <label>
            Team member
            <select value={userId} onChange={filter(setUserId)}>
              <option value="">All team members</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.disabled ? " (disabled)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Time period
          <select value={period} onChange={filter(setPeriod)}>
            {periods.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project
          <select value={projectId} onChange={filter(setProjectId)}>
            <option value="">All projects</option>
            {data.projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
                {p.active ? "" : " (archived)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hours shown
          <select value={basis} onChange={filter(setBasis)}>
            <option value="approved">Approved revisions</option>
            <option value="working">
              Working copies (includes unapproved)
            </option>
          </select>
        </label>
        {basis === "working" && (
          <label>
            Status
            <select value={status} onChange={filter(setStatus)}>
              <option value="">All statuses</option>
              {["Draft", "Submitted", "Rejected", "Approved"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {period === "custom" && (
          <>
            <label>
              Start date
              <input type="date" value={start} onChange={filter(setStart)} />
            </label>
            <label>
              End date
              <input
                type="date"
                min={start}
                value={end}
                onChange={filter(setEnd)}
              />
            </label>
          </>
        )}
      </div>
      <ErrorBox
        error={
          invalid
            ? "Select valid start and end dates. End date must be on or after start date."
            : error
        }
        retry={error ? () => setReload((n) => n + 1) : undefined}
      />
      <ErrorBox error={exportError} />
      {loading ? (
        <Loading />
      ) : (
        !invalid &&
        !error &&
        result && (
          <>
            <p className="range-label">
              {nice(result.range.start)}, {result.range.start.slice(0, 4)} –{" "}
              {nice(result.range.end)}, {result.range.end.slice(0, 4)} · IST ·{" "}
              {result.totals.entries} entries ·{" "}
              {result.basis === "approved"
                ? "Latest approved revision of each timesheet"
                : "Working copies, including unapproved time"}
            </p>
            {result.basis === "approved" &&
              (result.pending.awaitingApproval > 0 ||
                result.pending.underCorrection > 0) && (
                <div className="info-box">
                  {result.pending.awaitingApproval > 0 &&
                    `${result.pending.awaitingApproval} timesheet(s) awaiting approval are not counted yet. `}
                  {result.pending.underCorrection > 0 &&
                    `${result.pending.underCorrection} reopened or resubmitted timesheet(s) show their last approved revision until re-approved.`}
                </div>
              )}
            <div className="stats">
              <Stat
                label={
                  result.basis === "approved"
                    ? "APPROVED HOURS"
                    : "TOTAL TRACKED"
                }
                value={result.totals.hours.toFixed(2)}
                suffix="hrs"
                icon={Clock3}
                foot={
                  result.basis === "approved"
                    ? "Latest approved revisions in this period"
                    : "All working entries, any status"
                }
              />
              {result.basis === "approved" ? (
                <Stat
                  label="AWAITING APPROVAL"
                  value={result.pending.awaitingApproval}
                  icon={CheckCheck}
                  foot="Submitted timesheets not yet counted"
                />
              ) : (
                <Stat
                  label="APPROVED HOURS"
                  value={(
                    result.byStatus.find((s) => s._id === "Approved")?.hours ||
                    0
                  ).toFixed(2)}
                  suffix="hrs"
                  icon={CheckCheck}
                  foot="Working entries on approved sheets"
                />
              )}
              <Stat
                label="PROJECTS WORKED ON"
                value={result.byProject.length}
                icon={FolderKanban}
                foot="Where your time went"
              />
            </div>
            {result.basis === "approved" && result.unapproved && (
              <section className="card list-card unapproved-card">
                <div className="section-title">
                  <h2>
                    Not yet approved{" "}
                    <span className="count">
                      {result.unapproved.totals.hours.toFixed(2)} hrs
                    </span>
                  </h2>
                  <span className="muted">
                    Working entries · not included in the totals above
                  </span>
                </div>
                {result.unapproved.byStatus.length ? (
                  <>
                    {result.unapproved.byStatus.map((s) => (
                      <div className="report-project" key={s._id}>
                        <Status value={s._id} />
                        <b>
                          {s.sheets} timesheet{s.sheets === 1 ? "" : "s"} ·{" "}
                          {s.entries} entr{s.entries === 1 ? "y" : "ies"}
                        </b>
                        <div className="bar">
                          <i
                            style={{
                              width: `${result.unapproved.totals.hours ? (s.hours / result.unapproved.totals.hours) * 100 : 0}%`,
                              background: "#c9a46a",
                            }}
                          />
                        </div>
                        <strong>{s.hours.toFixed(2)} hrs</strong>
                      </div>
                    ))}
                    <p className="muted">
                      Reopened timesheets appear here with their working copy;
                      their last approved revision stays in the totals above.{" "}
                      <button
                        className="text-button"
                        onClick={() => {
                          setBasis("working");
                          setPage(1);
                        }}
                      >
                        View these entries
                      </button>
                    </p>
                  </>
                ) : (
                  <Empty text="No unapproved time in this period." />
                )}
              </section>
            )}
            <section className="card list-card">
              <div className="section-title">
                <h2>Time by project</h2>
                <span className="muted">
                  {result.basis === "approved"
                    ? "Approved entries"
                    : "All matching working entries"}
                </span>
              </div>
              {result.byProject.length ? (
                result.byProject.map((p, i) => (
                  <div className="report-project" key={p._id}>
                    <span
                      className="project-dot"
                      style={{
                        background: ["#7a9ac9", "#ac8ac5", "#b8b276"][i % 3],
                      }}
                    />
                    <b>
                      {p.name ||
                        nameOf(
                          data.projects,
                          p._id,
                          result.items.find((x) => x.projectId === p._id)
                            ?.projectName || "Historical project",
                        )}
                    </b>
                    <div className="bar">
                      <i
                        style={{
                          width: `${result.totals.hours ? (p.hours / result.totals.hours) * 100 : 0}%`,
                          background: "#83ab96",
                        }}
                      />
                    </div>
                    <strong>{p.hours.toFixed(2)} hrs</strong>
                  </div>
                ))
              ) : (
                <Empty text="No time entries match these filters." />
              )}
            </section>
            <section className="card report-table">
              <table>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Team member",
                      "Project / Task",
                      "Description",
                      "Hours",
                      "Status",
                    ].map((s) => (
                      <th key={s}>{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((r) => (
                    <tr key={r.entryId}>
                      <td>
                        {nice(r.date)}
                        <small>{r.date.slice(0, 4)}</small>
                      </td>
                      <td>{r.userName}</td>
                      <td>
                        {r.projectName}
                        <small>{r.taskName}</small>
                      </td>
                      <td className="wrap-text">{r.description}</td>
                      <td>{r.hours.toFixed(2)}</td>
                      <td>
                        <Status value={r.status} />
                        {r.revision && <small>Revision {r.revision}</small>}
                        {r.late && <small>Late submission</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={page}
                total={result.totals.entries}
                onChange={setPage}
              />
            </section>
          </>
        )
      )}
    </>
  );
}
