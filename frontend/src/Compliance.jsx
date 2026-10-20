import React, { useEffect, useState } from "react";
import { api } from "./api";
import { nice, addDays, initials } from "./lib";
import { ErrorBox, Loading, Empty, Pagination } from "./ui";
// Derived Missing / Overdue indicators for weeks whose Sunday IST deadline has passed (last 12 weeks).
export default function Compliance({ user }) {
  const [indicator, setIndicator] = useState(""),
    [page, setPage] = useState(1),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
      ...(indicator ? { indicator } : {}),
    });
    api(`/compliance?${params}`, { signal: c.signal })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [indicator, page, reload]);
  const choose = (value) => {
    setIndicator(value);
    setPage(1);
  };
  return (
    <>
      <ErrorBox error={error} retry={() => setReload((x) => x + 1)} />
      {loading ? (
        <Loading />
      ) : (
        !error &&
        result && (
          <section className="card list-card">
            <div className="section-title">
              <h2>
                Missing & overdue{" "}
                <span className="count">
                  {result.counts.missing + result.counts.overdue}
                </span>
              </h2>
              <span className="muted">
                Weeks of {nice(result.from)} – {nice(addDays(result.to, 6))},{" "}
                {result.to.slice(0, 4)} · past the Sunday IST deadline
              </span>
            </div>
            <div className="tabs compact" role="group" aria-label="Indicator">
              {[
                ["", `All (${result.counts.missing + result.counts.overdue})`],
                ["Missing", `Missing (${result.counts.missing})`],
                ["Overdue", `Overdue (${result.counts.overdue})`],
              ].map(([value, label]) => (
                <button
                  key={value || "all"}
                  aria-pressed={indicator === value}
                  className={indicator === value ? "selected" : ""}
                  onClick={() => choose(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {result.items.length ? (
              result.items.map((i) => (
                <div className="approval" key={`${i.userId}-${i.weekStart}`}>
                  <span className="avatar">{initials(i.userName)}</span>
                  <div className="grow">
                    <h3>
                      {i.userName}{" "}
                      {i.userId === user.id && (
                        <span className="muted">(you)</span>
                      )}
                      {i.disabled && <span className="muted">(disabled)</span>}
                    </h3>
                    <p>
                      Week of {nice(i.weekStart)} –{" "}
                      {nice(addDays(i.weekStart, 6))}, {i.weekStart.slice(0, 4)}
                      {i.indicator === "Overdue" &&
                        ` · ${i.status === "Rejected" ? "Rejected, not resubmitted" : "Draft, not submitted"}`}
                      {i.indicator === "Missing" && " · No timesheet started"}
                    </p>
                  </div>
                  <span className={`indicator ${i.indicator.toLowerCase()}`}>
                    {i.indicator}
                  </span>
                </div>
              ))
            ) : (
              <Empty
                text={
                  indicator
                    ? `No ${indicator.toLowerCase()} timesheets.`
                    : "Everyone expected has submitted for these weeks."
                }
              />
            )}
            <Pagination page={page} total={result.total} onChange={setPage} />
            <p className="form-note compliance-note">
              Only users with a time-tracking start date are expected, and only
              for weeks that lie fully between their start and end dates. Set
              these dates in Team → Manage.
            </p>
          </section>
        )
      )}
    </>
  );
}
