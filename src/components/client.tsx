"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WebCallPanel } from "./web-call";

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="linklike"
      onClick={async () => {
        await send("/api/auth/logout", "POST");
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        const r = await send("/api/auth/login", "POST", { pin: f.get("pin") });
        if (r.ok) {
          router.replace("/");
          router.refresh();
        } else {
          setError(String(r.data.error ?? "Could not sign in."));
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="pin">PIN</label>
        <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" required autoFocus />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy} style={{ width: "100%" }}>{busy ? "Checking…" : "Open dashboard"}</button>
    </form>
  );
}

/** Fetch orders from Shiprocket, or load sample orders to try the flow. */
export function OrdersToolbar({ shiprocketConnected, empty }: { shiprocketConnected: boolean; empty: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {msg && <span className={msg.ok ? "ok" : "error"} role="status">{msg.text}</span>}
      {(!shiprocketConnected || empty) && (
        <button
          className="btn secondary small"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await send("/api/orders/sample", "POST");
            setMsg({ ok: r.ok, text: r.ok ? `${r.data.created} sample orders added` : String(r.data.error ?? "Failed") });
            router.refresh();
          })}
        >
          Load sample orders
        </button>
      )}
      <button
        className="btn small"
        disabled={pending || !shiprocketConnected}
        title={shiprocketConnected ? undefined : "Connect Shiprocket first"}
        onClick={() => start(async () => {
          setMsg(null);
          const r = await send("/api/orders/sync", "POST");
          setMsg({ ok: r.ok, text: r.ok ? `${r.data.created} new, ${r.data.updated} updated` : String(r.data.error ?? "Sync failed") });
          router.refresh();
        })}
      >
        {pending ? "Fetching…" : "Fetch orders from Shiprocket"}
      </button>
    </span>
  );
}

/** "Start call": a voice call in the browser, or a phone call through the voice agent. */
export function CallPanel({ orderId, phoneReady, label, autoOpen }: { orderId: string; phoneReady: boolean; label: string; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [mode, setMode] = useState<"WEB" | "PHONE">("WEB");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)} style={{ width: "100%" }} id="start-call">
        {label}
      </button>
    );
  }
  return (
    <div className="panel" id="start-call">
      <h3>Call the customer</h3>
      <fieldset className="seg" style={{ padding: 0, margin: "0 0 16px", gridTemplateColumns: "1fr 1fr" }}>
        <legend className="sr" style={{ position: "absolute", left: -9999 }}>How to call</legend>
        <label><input type="radio" name="mode" checked={mode === "WEB"} onChange={() => setMode("WEB")} />Voice call in browser</label>
        <label><input type="radio" name="mode" checked={mode === "PHONE"} onChange={() => setMode("PHONE")} />Phone call</label>
      </fieldset>
      {mode === "WEB" ? (
        <WebCallPanel orderId={orderId} onClose={() => { setOpen(false); router.refresh(); }} />
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 14 }}>
            {phoneReady
              ? "The voice agent phones the customer, confirms the order and the address, and reports back here."
              : "Phone calls need the voice agent connected on the Connections page, and a telephony link to dial real numbers. Use the browser call to try the whole flow."}
          </p>
          <button
            className="btn"
            style={{ width: "100%" }}
            disabled={pending || !phoneReady}
            onClick={() => start(async () => {
              setMsg("");
              const r = await send(`/api/orders/${orderId}/call/phone`, "POST");
              if (!r.ok) setMsg(String(r.data.error ?? "Could not call."));
              else { setOpen(false); router.refresh(); }
            })}
          >
            {pending ? "Calling…" : "Place the phone call"}
          </button>
        </>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
      <p style={{ marginTop: 12 }}><button type="button" className="linklike" onClick={() => setOpen(false)}>Cancel</button></p>
    </div>
  );
}

export function PushAddressButton({ orderId, state, error }: { orderId: string; state: string; error?: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (state === "APPLIED") return <p className="ok">Shiprocket has the new address.</p>;
  return (
    <div>
      <button
        className="btn"
        disabled={pending}
        onClick={() => start(async () => {
          setMsg(null);
          const r = await send(`/api/orders/${orderId}/shiprocket`, "POST");
          setMsg({ ok: r.ok, text: r.ok ? String(r.data.message ?? "Updated") : String(r.data.error ?? "Failed") });
          router.refresh();
        })}
      >
        {pending ? "Updating…" : state === "FAILED" ? "Try again: update Shiprocket" : "Update address in Shiprocket"}
      </button>
      {state === "FAILED" && error && !msg && <p className="error" role="alert">{error}</p>}
      {msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
    </div>
  );
}

type Field = { name: string; label: string; type?: string; hint?: string; optional?: boolean };

export function ConnectionForm({ provider, title, blurb, fields, connected, label, error }: { provider: "shiprocket" | "voice"; title: string; blurb: string; fields: Field[]; connected: boolean; label?: string | null; error?: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body: Record<string, string> = {};
        for (const x of fields) body[x.name] = String(f.get(x.name) ?? "").trim();
        start(async () => {
          setMsg(null);
          const r = await send(`/api/connections/${provider}`, "PUT", body);
          setMsg({ ok: r.ok, text: r.ok ? "Saved." : String(r.data.error ?? "Could not save.") });
          router.refresh();
        });
      }}
    >
      <h3>{title} {connected && <span className="tag good">Connected</span>}</h3>
      <p className="sub" style={{ marginBottom: 14 }}>{blurb}</p>
      {connected && label && <p className="muted" style={{ marginBottom: 10 }}>Saved: {label}</p>}
      {!connected && error && <p className="error" role="alert">{error}</p>}
      {fields.map((x) => (
        <div className="field" key={x.name}>
          <label htmlFor={`${provider}-${x.name}`}>{x.label}{x.optional ? " (optional)" : ""}</label>
          <input id={`${provider}-${x.name}`} name={x.name} type={x.type ?? "text"} autoComplete="off" required={!x.optional} placeholder={connected && x.type === "password" ? "Saved. Type to replace" : undefined} />
          {x.hint && <span className="h">{x.hint}</span>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" disabled={pending}>{pending ? "Saving…" : connected ? "Save changes" : "Save and check"}</button>
        {connected && (
          <button type="button" className="btn secondary" disabled={pending} onClick={() => start(async () => { await send(`/api/connections/${provider}`, "DELETE"); router.refresh(); })}>Disconnect</button>
        )}
      </div>
      {msg && <p className={msg.ok ? "ok" : "error"} role="status">{msg.text}</p>}
    </form>
  );
}

export function SettingsForm({ language, autoUpdate }: { language: string; autoUpdate: boolean }) {
  const router = useRouter();
  const [lang, setLang] = useState(language);
  const [auto, setAuto] = useState(autoUpdate);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await send("/api/settings", "PUT", { language: lang, autoUpdate: auto });
          setMsg(r.ok ? "Saved." : String(r.data.error ?? "Could not save."));
          router.refresh();
        });
      }}
    >
      <div className="field">
        <label htmlFor="lang">Language the agent speaks</label>
        <select id="lang" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
        </select>
        <span className="h">Choosing the language by customer region comes later.</span>
      </div>
      <div className="field">
        <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Update Shiprocket automatically when a customer gives a new address</label>
        <span className="h">Off by default: you press a button to send the change.</span>
      </div>
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {msg && <p className="ok" role="status">{msg}</p>}
    </form>
  );
}
