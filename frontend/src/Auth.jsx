import React, { useState } from "react";
import { Clock3, ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "./api";
import { ErrorBox } from "./ui";
export default function Auth({ onLogin, notice, mode: initialMode, token }) {
  const [mode, setMode] = useState(initialMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(notice || "");
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (mode === "reset") {
        if (f.get("newPassword") !== f.get("confirmPassword"))
          throw new Error("Passwords do not match.");
        await api("/auth/reset-password", {
          method: "POST",
          body: { token, newPassword: f.get("newPassword") },
        });
        history.replaceState({}, "", "/");
        setMode("login");
        setMessage("Password reset. Sign in with your new password.");
      } else {
        const result = await api(
          mode === "invite" ? "/auth/accept-invitation" : "/auth/login",
          {
            method: "POST",
            body:
              mode === "invite"
                ? { token, temporaryPassword: f.get("password") }
                : { email: f.get("email"), password: f.get("password") },
          },
        );
        history.replaceState({}, "", "/");
        onLogin(result.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "invite"
      ? "Welcome to the team."
      : mode === "reset"
        ? "A fresh start."
        : "Welcome back.";
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Clock3 size={25} />
          </span>
          tempo.
        </div>
        <div>
          <div className="eyebrow">A MORE MINDFUL WAY TO WORK</div>
          <h1>
            Good work.
            <br />
            Time well spent.
          </h1>
          <p>
            One place for your projects, your people,
            <br />
            and every hour that moves you forward.
          </p>
          <div className="auth-week">
            <span>MON</span>
            <span>TUE</span>
            <span>WED</span>
            <span>THU</span>
            <span>FRI</span>
            <span>SAT</span>
            <span>SUN</span>
            {[55, 80, 65, 90, 72, 15, 15].map((n, i) => (
              <i key={i} style={{ height: n }} />
            ))}
          </div>
        </div>
        <small>Track thoughtfully. Make your week count.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <ShieldCheck size={27} className="green" />
          <h1>{title}</h1>
          <p>
            {mode === "invite"
              ? "Enter the temporary password shared by your Admin. You can change it later in Account."
              : mode === "reset"
                ? "Choose a password with at least 12 characters."
                : "Sign in to your workspace to pick up where you left off."}
          </p>
          {message && (
            <div className="info-box" role="status">
              {message}
            </div>
          )}
          <ErrorBox error={error} />
          {(mode === "invite" || mode === "reset") && !token ? (
            <div className="error-box">
              This link is missing its token. Ask your Admin for a new link.
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={busy}>
                {mode === "login" && (
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      autoFocus
                      placeholder="you@company.com"
                    />
                  </label>
                )}
                <label>
                  {mode === "reset"
                    ? "New password"
                    : mode === "invite"
                      ? "Temporary password"
                      : "Password"}
                  <input
                    name={mode === "reset" ? "newPassword" : "password"}
                    type="password"
                    required
                    minLength={mode === "reset" ? 12 : 1}
                    maxLength={128}
                    autoComplete={
                      mode === "reset" ? "new-password" : "current-password"
                    }
                  />
                </label>
                {mode === "reset" && (
                  <label>
                    Confirm password
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                )}
                <button className="button primary full-width">
                  {busy
                    ? "Please wait…"
                    : mode === "invite"
                      ? "Accept invitation"
                      : mode === "reset"
                        ? "Reset password"
                        : "Sign in"}
                  <ArrowRight size={17} />
                </button>
              </fieldset>
            </form>
          )}
          <button
            className="text-button auth-help"
            onClick={() => {
              if (mode !== "login") {
                history.replaceState({}, "", "/");
                setMode("login");
                setError("");
              } else
                setMessage(
                  "Ask your Admin for a password-reset link. Email delivery is not enabled yet.",
                );
            }}
          >
            {mode === "login" ? "Forgot your password?" : "Back to sign in"}
          </button>
          {mode === "login" && (
            <p className="setup-hint">
              First time setting up Tempo? Create your initial Admin with{" "}
              <code>npm run setup</code> in the backend folder.
            </p>
          )}
        </div>
        <small>Monday–Sunday · India Standard Time</small>
      </section>
    </div>
  );
}
