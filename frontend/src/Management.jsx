import React, { useState } from "react";
import { Plus, Search, FolderKanban, Copy, Check } from "lucide-react";
import { mutation } from "./api";
import { initials, nameOf, stamp, istToday } from "./lib";
import { Heading, ErrorBox, Empty, Modal, Pagination } from "./ui";
export default function Management({
  page: kind,
  user,
  data,
  refresh,
  notify,
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("active"),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [credentials, setCredentials] = useState(null),
    [copyStatus, setCopyStatus] = useState("");
  const team = kind === "Team",
    projects = kind === "Projects",
    path = team ? "users" : kind.toLowerCase(),
    items = data[path],
    canWrite = user.role === "Admin" || ["Projects", "Tasks"].includes(kind),
    single = team
      ? "user"
      : projects
        ? "project"
        : kind === "Tasks"
          ? "task"
          : "client";
  const filtered = items.filter(
    (x) =>
      (filter === "all" ||
        (filter === "active"
          ? team
            ? !x.disabled
            : x.active
          : team
            ? x.disabled
            : !x.active)) &&
      `${x.name} ${x.email || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const shown = filtered.slice((page - 1) * 20, page * 20);
  function open(item = null) {
    setError("");
    setModal({ item });
  }
  function showCredentials(result) {
    const info = result.invitation || result;
    const localLink = `${location.origin}${result.invitation ? "/invite" : "/reset-password"}#token=${info.token}`;
    setCopyStatus("");
    setCredentials({
      ...info,
      link: localLink,
      email: result.user?.email,
      type: result.invitation ? "Invitation" : "Password reset",
    });
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget),
      item = modal.item;
    try {
      let body = { name: f.get("name").trim() };
      if (team) {
        const trackingStart = f.get("trackingStart") || null,
          trackingEnd = f.get("trackingEnd") || null;
        if (!item)
          body = {
            ...body,
            email: f.get("email"),
            role: f.get("role"),
            ...(trackingStart ? { trackingStart } : {}),
            ...(trackingEnd ? { trackingEnd } : {}),
          };
        else
          body = {
            ...body,
            version: item.version,
            trackingStart,
            trackingEnd,
            ...(item.role !== "Admin"
              ? { role: f.get("role"), disabled: f.get("disabled") === "on" }
              : {}),
          };
      } else {
        if (projects)
          body = {
            ...body,
            client: f.get("client"),
            members: f.getAll("members"),
          };
        if (item)
          body = {
            ...body,
            version: item.__v,
            active: f.get("active") === "on",
          };
      }
      const result = await mutation(
        `/${path}${item ? "/" + (item.id || item._id) : ""}`,
        body,
        item ? "PATCH" : "POST",
      );
      setModal(null);
      if (team && !item) showCredentials(result);
      notify(
        `${single[0].toUpperCase() + single.slice(1)} ${item ? "updated" : "created"}.`,
      );
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function accountAction(item, action) {
    setError("");
    setBusy(true);
    try {
      const result = await mutation(`/users/${item.id}/${action}`);
      showCredentials(result);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${credentials.type}\n${credentials.email || ""}\n${credentials.link}${credentials.temporaryPassword ? `\nTemporary password: ${credentials.temporaryPassword}` : ""}\nExpires: ${stamp(credentials.expiresAt)}\nPassword change is optional and recommended.`,
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Select and copy the link and password below.");
    }
  }
  return (
    <>
      <Heading
        title={team ? "Your people" : kind}
        description={
          team
            ? "Give everyone the right access to do their best work."
            : projects
              ? "Organize the work. Bring the right people together."
              : kind === "Tasks"
                ? "One shared task library across every project."
                : "The people and businesses you do great work with."
        }
      >
        {canWrite && (
          <button className="button primary" onClick={() => open()}>
            <Plus size={17} />
            {team ? "Invite user" : `New ${single}`}
          </button>
        )}
      </Heading>
      {!modal && <ErrorBox error={error} retry={refresh} />}
      <div className="collection-tools">
        <div className="search">
          <Search size={17} />
          <input
            aria-label={`Search ${kind.toLowerCase()}`}
            placeholder={`Search ${kind.toLowerCase()}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="filter-select"
          aria-label="Record status"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="active">{team ? "Enabled" : "Active"}</option>
          <option value="archived">{team ? "Disabled" : "Archived"}</option>
          <option value="all">All</option>
        </select>
      </div>
      {!filtered.length ? (
        <section className="card">
          <Empty
            text={
              query
                ? "No matches. Try a different search."
                : `No ${kind.toLowerCase()} here yet.`
            }
          />
        </section>
      ) : (
        <div className={projects ? "project-grid" : "card list-card"}>
          {shown.map((item) =>
            projects ? (
              <article className="card project-card" key={item._id}>
                <div className="project-card-top">
                  <span className="project-symbol">
                    <FolderKanban size={24} />
                  </span>
                  <span
                    className={`status compact ${item.active ? "approved" : "draft"}`}
                  >
                    {item.active ? "Active" : "Archived"}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p>{nameOf(data.clients, item.client, "Client")}</p>
                <div className="project-card-bottom">
                  <div className="avatar-stack">
                    {item.members?.slice(0, 4).map((id) => (
                      <span
                        className="avatar small"
                        key={id}
                        title={nameOf(data.users, id)}
                      >
                        {initials(nameOf(data.users, id, "?"))}
                      </span>
                    ))}
                    <span className="muted">
                      {item.members?.length || 0} members
                    </span>
                  </div>
                  {canWrite && (
                    <button className="text-button" onClick={() => open(item)}>
                      Manage project
                    </button>
                  )}
                </div>
              </article>
            ) : (
              <div className="list-row" key={item.id || item._id}>
                <span className="avatar">{initials(item.name)}</span>
                <div className="grow">
                  <h3>{item.name}</h3>
                  <p>
                    {item.email ||
                      (kind === "Tasks"
                        ? "Shared across all projects"
                        : `${data.projects.filter((p) => p.client === item._id).length} projects`)}
                  </p>
                </div>
                <span className="muted">
                  {team
                    ? (item.disabled
                        ? "Disabled"
                        : item.active
                          ? "Active"
                          : "Invitation pending") +
                      (item.trackingStart ? "" : " · not tracked")
                    : item.active
                      ? "Active"
                      : "Archived"}
                </span>
                {team && <span className="role-pill">{item.role}</span>}
                {canWrite && (
                  <button className="button outline" onClick={() => open(item)}>
                    Manage
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}
      <Pagination page={page} total={filtered.length} onChange={setPage} />
      {modal && (
        <Modal
          title={
            modal.item
              ? `Manage ${single}`
              : team
                ? "Invite a teammate"
                : `New ${single}`
          }
          close={() => setModal(null)}
          busy={busy}
        >
          <ErrorBox error={error} />
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <label>
                {team ? "Full name" : "Name"}
                <input
                  name="name"
                  required
                  maxLength={team ? 120 : 160}
                  defaultValue={modal.item?.name || ""}
                />
              </label>
              {team ? (
                <>
                  {!modal.item ? (
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                      />
                    </label>
                  ) : (
                    <p>{modal.item.email}</p>
                  )}
                  <label>
                    Role
                    <select
                      name="role"
                      defaultValue={modal.item?.role || "User"}
                      disabled={modal.item?.role === "Admin"}
                    >
                      {["User", "Manager", "Admin"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <div className="date-pair">
                    <label>
                      Time tracking starts
                      <input
                        type="date"
                        name="trackingStart"
                        defaultValue={
                          modal.item
                            ? modal.item.trackingStart || ""
                            : istToday()
                        }
                      />
                    </label>
                    <label>
                      Time tracking ends (optional)
                      <input
                        type="date"
                        name="trackingEnd"
                        defaultValue={modal.item?.trackingEnd || ""}
                      />
                    </label>
                  </div>
                  <p className="form-note">
                    Weekly timesheets are expected only for Monday–Sunday weeks
                    fully inside these dates. Leave the start empty to never
                    flag this person as missing. Disabling an account without an
                    end date ends tracking today.
                  </p>
                  {modal.item && modal.item.role !== "Admin" && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        name="disabled"
                        defaultChecked={modal.item.disabled}
                      />
                      Disable account
                    </label>
                  )}
                  {modal.item?.role === "Admin" && (
                    <p className="form-note">
                      Admin accounts cannot be disabled or demoted here.
                    </p>
                  )}
                  {!modal.item && (
                    <p className="form-note">
                      Email is not enabled. After creating the user, copy their
                      invitation link and temporary password to share manually.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {projects && (
                    <>
                      <label>
                        Client
                        <select
                          name="client"
                          required
                          defaultValue={modal.item?.client || ""}
                        >
                          <option value="" disabled>
                            Select a client
                          </option>
                          {data.clients
                            .filter(
                              (c) => c.active || c._id === modal.item?.client,
                            )
                            .map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name}
                                {c.active ? "" : " (archived — select another)"}
                              </option>
                            ))}
                        </select>
                      </label>
                      {!data.clients.some((c) => c.active) && (
                        <p className="form-note">
                          An Admin must create an active client before you can
                          save a project.
                        </p>
                      )}
                      <label>Project team</label>
                      <div className="member-picker">
                        {data.users.map((u) => (
                          <label className="checkbox" key={u.id}>
                            <input
                              type="checkbox"
                              name="members"
                              value={u.id}
                              defaultChecked={
                                !u.disabled &&
                                modal.item?.members.includes(u.id)
                              }
                              disabled={u.disabled}
                            />
                            {u.name}
                            <span className="muted">
                              {u.disabled ? "Disabled" : u.role}
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {modal.item && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={modal.item.active}
                      />
                      Active (uncheck to archive)
                    </label>
                  )}
                </>
              )}
              <button
                className="button primary full-width"
                disabled={projects && !data.clients.some((c) => c.active)}
              >
                {busy
                  ? "Saving…"
                  : modal.item
                    ? "Save changes"
                    : team
                      ? "Create invitation"
                      : `Create ${single}`}
              </button>
            </fieldset>
          </form>
          {team && modal.item && !modal.item.disabled && (
            <div className="account-actions">
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  accountAction(
                    modal.item,
                    modal.item.active ? "password-reset" : "invitation",
                  )
                }
              >
                {modal.item.active
                  ? "Create password-reset link"
                  : "Reissue invitation"}
              </button>
            </div>
          )}
          {error?.status === 409 && (
            <button
              className="text-button"
              onClick={async () => {
                setModal(null);
                await refresh();
              }}
            >
              Reload the latest record
            </button>
          )}
        </Modal>
      )}
      {credentials && (
        <Modal
          title={`${credentials.type} ready`}
          close={() => setCredentials(null)}
        >
          <p>
            No email was sent. Copy these details before closing; the temporary
            password cannot be retrieved later.
          </p>
          <label>
            Link
            <input
              readOnly
              value={credentials.link}
              onFocus={(e) => e.target.select()}
            />
          </label>
          {credentials.temporaryPassword && (
            <label>
              Temporary password
              <input
                readOnly
                value={credentials.temporaryPassword}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          <p className="range-label">Expires {stamp(credentials.expiresAt)}</p>
          <button className="button primary full-width" onClick={copy}>
            {copyStatus === "Copied" ? <Check size={16} /> : <Copy size={16} />}
            Copy details
          </button>
          {copyStatus && <p role="status">{copyStatus}</p>}
          <p className="form-note">
            Password change after sign-in is optional and recommended.
          </p>
        </Modal>
      )}
    </>
  );
}
