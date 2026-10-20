import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Clock3,
  CalendarDays,
  CheckCheck,
  BarChart3,
  FolderKanban,
  Users,
  Building2,
  ListTodo,
  ChevronRight,
  HelpCircle,
  LogOut,
  Settings,
} from "lucide-react";
import { api, allPages, mutation, clearSession } from "./api";
import { initials } from "./lib";
import { ErrorBox, Loading, Modal, Heading } from "./ui";
import Auth from "./Auth";
import Timesheet from "./Timesheet";
import Approvals from "./Approvals";
import Reports from "./Reports";
import Management from "./Management";
import "./style.css";
const initialRoute = {
  mode:
    location.pathname === "/invite"
      ? "invite"
      : location.pathname === "/reset-password"
        ? "reset"
        : "login",
  token: new URLSearchParams(location.hash.slice(1)).get("token") || "",
};
// Keep invitation/reset tokens only in memory, not browser history or storage.
if (initialRoute.token) history.replaceState({}, "", location.pathname);
function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [notice, setNotice] = useState(""),
    [authError, setAuthError] = useState(""),
    [authReload, setAuthReload] = useState(0),
    [route, setRoute] = useState(initialRoute);
  useEffect(() => {
    let live = true;
    setChecking(true);
    setAuthError("");
    if (route.mode !== "login") {
      setChecking(false);
      return;
    }
    api("/auth/me")
      .then(async (result) => {
        await api("/auth/csrf");
        if (live) setUser(result.user);
      })
      .catch((e) => {
        if (live && e.status !== 401) setAuthError(e);
      })
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, [authReload, route.mode]);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setNotice("Your session ended. Please sign in again.");
    };
    window.addEventListener("tempo-session-expired", expired);
    return () => window.removeEventListener("tempo-session-expired", expired);
  }, []);
  function signedIn(value) {
    setRoute({ mode: "login", token: "" });
    setUser(value);
    setNotice("");
  }
  function signedOut(message = "You have signed out.") {
    clearSession();
    setUser(null);
    setNotice(message);
    setRoute({ mode: "login", token: "" });
  }
  if (checking)
    return (
      <div className="full-loading">
        <Loading />
      </div>
    );
  if (authError)
    return (
      <div className="connection-error">
        <h1>Let’s reconnect.</h1>
        <ErrorBox error={authError} retry={() => setAuthReload((n) => n + 1)} />
      </div>
    );
  return user ? (
    <Workspace key={user.id} user={user} signedOut={signedOut} />
  ) : (
    <Auth
      onLogin={signedIn}
      notice={notice}
      mode={route.mode}
      token={route.token}
    />
  );
}
function Workspace({ user, signedOut }) {
  const [page, setPage] = useState("Timesheet"),
    [ownReport, setOwnReport] = useState(false),
    [dirty, setDirty] = useState(false),
    [working, setWorking] = useState(false),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
    [logoutBusy, setLogoutBusy] = useState(false);
  const privileged = user.role !== "User",
    toastTimer = useRef(),
    loadController = useRef();
  const refresh = useCallback(async () => {
    loadController.current?.abort();
    const c = new AbortController();
    loadController.current = c;
    setError("");
    try {
      const [projects, tasks, users, clients] = await Promise.all([
        allPages("/projects?active=all", c.signal),
        allPages("/tasks?active=all", c.signal),
        privileged ? allPages("/users", c.signal) : Promise.resolve([]),
        privileged
          ? allPages("/clients?active=all", c.signal)
          : Promise.resolve([]),
      ]);
      if (!c.signal.aborted) setData({ projects, tasks, users, clients });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e);
      }
    }
  }, [privileged]);
  useEffect(() => {
    refresh().catch(() => {});
    return () => loadController.current?.abort();
  }, [refresh]);
  useEffect(() => {
    const before = (e) => {
      if (dirty || working) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty, working]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(text) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function navigate(next, own = false) {
    if (working) return;
    if (next === page && !(next === "Reports" && own !== ownReport)) return;
    if (dirty && !window.confirm("Discard unsaved timesheet changes?")) return;
    setDirty(false);
    setOwnReport(own);
    setPage(next);
  }
  async function logout() {
    if (working) return;
    if (dirty && !window.confirm("Sign out and discard unsaved changes?"))
      return;
    setLogoutBusy(true);
    try {
      await mutation("/auth/logout");
      signedOut();
    } catch (e) {
      setError(e);
    } finally {
      setLogoutBusy(false);
    }
  }
  const nav = [
    [
      "WORKSPACE",
      [
        ["Timesheet", CalendarDays],
        ...(privileged ? [["Approvals", CheckCheck]] : []),
        ["Reports", BarChart3],
      ],
    ],
    ...(privileged
      ? [
          [
            "MANAGE",
            [
              ["Projects", FolderKanban],
              ["Tasks", ListTodo],
              ["Clients", Building2],
              ["Team", Users],
            ],
          ],
        ]
      : []),
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Timesheet")}>
          <span className="brand-icon">
            <Clock3 size={25} />
          </span>
          tempo<span className="brand-dot">.</span>
        </button>
        <div className="workspace">
          <span className="workspace-avatar">T</span>
          <div>
            <b>Team workspace</b>
            <small>INDIA STANDARD TIME</small>
          </div>
        </div>
        {nav.map(([title, items]) => (
          <div className="nav-section" key={title}>
            <label>{title}</label>
            {items.map(([name, Icon]) => (
              <button
                title={name}
                aria-label={name}
                aria-current={page === name ? "page" : undefined}
                className={`nav-item ${page === name ? "active" : ""}`}
                key={name}
                onClick={() => navigate(name)}
              >
                <Icon size={19} />
                {name}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-bottom">
          <div className="tip">
            <span className="tip-icon">✧</span>
            <b>Make time for what matters.</b>
            <p>
              40 hours. A week of progress.
              <br />
              Make every hour count.
            </p>
          </div>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <HelpCircle size={18} />
            Help & getting started
          </button>
          <button
            className={`nav-item ${page === "Account" ? "active" : ""}`}
            onClick={() => navigate("Account")}
          >
            <Settings size={18} />
            Account
          </button>
          <div className="profile">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <b>{user.name}</b>
              <small>{user.role}</small>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              disabled={logoutBusy}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <span>{page}</span>
          </div>
          <div className="top-actions">
            <span className="role-pill">{user.role}</span>
            <button
              className="avatar small"
              title="Account"
              aria-label="Account"
              onClick={() => navigate("Account")}
            >
              {initials(user.name)}
            </button>
            <button
              className="mobile-logout"
              aria-label="Sign out"
              disabled={logoutBusy}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <ErrorBox error={error} retry={() => refresh().catch(() => {})} />
          {!data ? (
            !error && <Loading />
          ) : page === "Timesheet" ? (
            <Timesheet
              user={user}
              data={data}
              dirty={dirty}
              setDirty={setDirty}
              setWorking={setWorking}
              notify={notify}
              viewReport={() => navigate("Reports", true)}
            />
          ) : page === "Approvals" && privileged ? (
            <Approvals user={user} data={data} notify={notify} />
          ) : page === "Reports" ? (
            <Reports
              key={String(ownReport)}
              user={user}
              data={data}
              own={ownReport}
            />
          ) : page === "Account" ? (
            <Account user={user} signedOut={signedOut} />
          ) : privileged ? (
            <Management
              key={page}
              page={page}
              user={user}
              data={data}
              refresh={refresh}
              notify={notify}
            />
          ) : null}
        </main>
        <footer>
          © {new Date().getFullYear()} Tempo
          <span>A more mindful way to work.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={17} />
          {toast}
        </div>
      )}
      {help && (
        <Modal title="A good week starts here." close={() => setHelp(false)}>
          <p>
            Add time to any day, select a project and shared task, then save
            your draft. Your week runs Monday to Sunday in IST.
          </p>
          <p>
            Submit at least 40 hours by Sunday night. Late submissions are
            accepted and flagged. Managers and Admins can review any submitted
            timesheet. Only Admins can reopen approved time.
          </p>
          <p>
            Users see their own time and reports, and can select assigned
            projects. Email is not yet enabled; Admins share invitations and
            password-reset links manually.
          </p>
        </Modal>
      )}
    </div>
  );
}
function Account({ user, signedOut }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    if (f.get("newPassword") !== f.get("confirm")) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await mutation("/auth/change-password", {
        currentPassword: f.get("currentPassword"),
        newPassword: f.get("newPassword"),
      });
      signedOut("Password changed. Sign in with your new password.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="Your account"
        description="A little care for your workspace access."
      />
      <section className="card account-card">
        <h2>{user.name}</h2>
        <p>
          {user.email} · {user.role}
        </p>
        <h2>Change password</h2>
        <p>
          Password changes are optional. Updating your password signs you out on
          all devices.
        </p>
        <ErrorBox error={error} />
        <form onSubmit={change}>
          <fieldset disabled={busy}>
            <label>
              Current password
              <input
                name="currentPassword"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm new password
              <input
                name="confirm"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <button className="button primary">
              {busy ? "Updating…" : "Change password"}
            </button>
          </fieldset>
        </form>
      </section>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
