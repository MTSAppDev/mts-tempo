import React, { useEffect, useRef } from "react";
import {
  X,
  CheckCheck,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
export function ErrorBox({ error, retry }) {
  return error ? (
    <div className="error-box" role="alert">
      <span>{error.message || error}</span>
      {retry && (
        <button className="button outline" onClick={retry}>
          Reload
        </button>
      )}
    </div>
  ) : null;
}
export function Loading({ text = "Loading your workspace…" }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {text}
    </div>
  );
}
export function Empty({ text }) {
  return (
    <div className="empty">
      <CheckCheck size={30} />
      <p>{text}</p>
    </div>
  );
}
export function Status({ value }) {
  return (
    <span className={`status compact ${value.toLowerCase()}`}>{value}</span>
  );
}
export function Stat({ label, value, suffix, icon: Icon, foot, progress }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        {label}
        {Icon && <Icon size={18} />}
      </div>
      <div className="stat-value">
        {value}
        {suffix && <span>{suffix}</span>}
      </div>
      {progress !== undefined && (
        <div className="progress">
          <i style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
export function Heading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">YOUR TIME, WELL SPENT</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Pagination({ page, total, limit = 20, onChange }) {
  return (
    <div className="pagination">
      <span>
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / limit))}
      </span>
      <button
        className="button outline"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        className="button outline"
        aria-label="Next page"
        disabled={page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
export function Modal({ title, children, close, busy = false, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  function keydown(e) {
    if (e.key === "Escape" && !busy) closeRef.current();
    if (e.key === "Tab") {
      const nodes = [
        ...ref.current.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (!nodes.length) {
        e.preventDefault();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        onKeyDown={keydown}
        className={`modal ${wide ? "wide-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close"
          aria-label="Close dialog"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
