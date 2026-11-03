"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Line = { who: "agent" | "customer"; text: string };
type Phase = "idle" | "speaking" | "listening" | "thinking" | "ended";

type Alt = { transcript: string };
type Result = ArrayLike<Alt> & { isFinal: boolean };
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const LABEL: Record<Phase, string> = { idle: "", speaking: "Agent speaking", listening: "Listening", thinking: "…", ended: "Call ended" };

/**
 * Hands-free voice call. The microphone stays open, the agent answers out loud as soon as you stop talking,
 * and (with headphones) you can interrupt it mid-sentence.
 */
export function WebCallPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState("");
  const [supported, setSupported] = useState(true);
  const [muted, setMuted] = useState(false);
  const [interrupt, setInterrupt] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);

  const rec = useRef<Rec | null>(null);
  const callRef = useRef<string | null>(null);
  const live = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const mutedRef = useRef(false);
  const interruptRef = useRef(false);
  const speakingRef = useRef(false);
  const langRef = useRef<"en" | "hi">("en");
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<(t: string) => void>(() => {});

  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  mutedRef.current = muted;
  interruptRef.current = interrupt;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    window.speechSynthesis?.getVoices();
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lines]);

  function teardown() {
    live.current = false;
    try { rec.current?.abort(); } catch { /* not running */ }
    window.speechSynthesis?.cancel();
    const a = audio.current;
    if (a) { cancelAnimationFrame(a.raf); a.stream.getTracks().forEach((t) => t.stop()); void a.ctx.close().catch(() => {}); audio.current = null; }
  }

  async function openMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(mutedRef.current ? 0 : Math.min(1, peak / 60));
        if (audio.current) audio.current.raf = requestAnimationFrame(tick);
      };
      audio.current = { ctx, stream, raf: requestAnimationFrame(tick) };
    } catch {
      /* the meter is cosmetic; recognition asks for the mic itself */
    }
  }

  const speak = useCallback((text: string, then: () => void) => {
    const synth = window.speechSynthesis;
    if (!synth) return then();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const want = langRef.current === "hi" ? "hi" : "en";
    const v = voices.find((x) => x.lang === `${want}-IN`) ?? voices.find((x) => x.lang.startsWith(want));
    if (v) u.voice = v;
    u.lang = v?.lang ?? `${want}-IN`;
    u.rate = 1.05;
    let done = false;
    const fin = () => { if (!done) { done = true; speakingRef.current = false; then(); } };
    u.onend = fin;
    u.onerror = fin;
    speakingRef.current = true;
    synth.speak(u);
  }, []);

  const finish = useCallback(() => {
    teardown();
    go("ended");
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const startRecognition = useCallback(() => {
    if (!live.current) return;
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = langRef.current === "hi" ? "hi-IN" : "en-IN";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      if (mutedRef.current) return;
      // While the agent talks the mic is ignored, unless interrupting is on and the person clearly says something.
      const talking = speakingRef.current;
      if (talking && !interruptRef.current) return;
      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else partial += res[0].transcript;
      }
      if (talking && (finalText || partial).trim().split(/\s+/).length >= 2) {
        window.speechSynthesis.cancel();
        speakingRef.current = false;
      }
      setInterim(partial);
      if (finalText.trim() && phaseRef.current !== "thinking") {
        setInterim("");
        submitRef.current(finalText.trim());
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        live.current = false;
        setSupported(false);
        setMsg("The microphone is blocked. Allow it in the browser's address bar and start again, or type your replies.");
      }
    };
    // Chrome ends continuous recognition every so often; keep the line open.
    r.onend = () => { if (live.current) setTimeout(startRecognition, 150); };
    rec.current = r;
    try { r.start(); } catch { /* already running */ }
  }, []);

  const afterAgent = useCallback((done: boolean) => {
    if (done) return finish();
    go("listening");
  }, [finish]);

  const submit = useCallback(async (text: string) => {
    const id = callRef.current;
    if (!id || !text.trim() || phaseRef.current === "ended") return;
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setLines((l) => [...l, { who: "customer", text }]);
    go("thinking");
    const r = await post(`/api/calls/${id}/turn`, { text });
    if (!r.ok) { setMsg(String(r.data.error ?? "The call dropped.")); return finish(); }
    const reply = String(r.data.reply);
    const done = Boolean(r.data.done);
    setLines((l) => [...l, { who: "agent", text: reply }]);
    go("speaking");
    speak(reply, () => afterAgent(done));
  }, [speak, finish, afterAgent]);
  submitRef.current = submit;

  async function begin() {
    setMsg("");
    const r = await post(`/api/orders/${orderId}/call/start`);
    if (!r.ok) return setMsg(String(r.data.error ?? "Could not start the call."));
    const id = String(r.data.callId);
    const text = String(r.data.text);
    langRef.current = r.data.lang === "hi" ? "hi" : "en";
    callRef.current = id;
    setCallId(id);
    live.current = true;
    setLines([{ who: "agent", text }]);
    go("speaking");
    void openMeter();
    startRecognition();
    speak(text, () => afterAgent(false));
  }

  async function hangUp() {
    const id = callRef.current;
    finish();
    if (id) await post(`/api/calls/${id}/end`);
    router.refresh();
  }

  const active = phase !== "idle" && phase !== "ended";
  const scale = 1 + (phase === "listening" ? level * 0.5 : phase === "speaking" ? 0.25 : 0);

  return (
    <div>
      {phase === "idle" && (
        <>
          <p className="sub" style={{ marginBottom: 14 }}>
            A hands-free voice call. Just talk: the agent answers out loud as soon as you stop, and the mic stays open for the whole call. Use Chrome or Edge and allow the microphone. Headphones give the best result.
          </p>
          <button className="btn" style={{ width: "100%" }} onClick={begin}>Start the voice call</button>
        </>
      )}

      {phase !== "idle" && (
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div
            aria-hidden="true"
            style={{
              width: 96, height: 96, margin: "6px auto 10px", borderRadius: "50%",
              background: phase === "speaking" ? "#0b57d0" : phase === "listening" ? "#1a7f37" : "var(--ink-3, #888)",
              transform: `scale(${scale})`, transition: "transform 90ms linear, background 200ms",
              opacity: phase === "ended" ? 0.35 : 1,
            }}
          />
          <p style={{ fontWeight: 600 }} aria-live="polite">{LABEL[phase]}{muted && active ? " (mic muted)" : ""}</p>
          <p className="muted" style={{ minHeight: 44, fontSize: 14, margin: "6px 0 0" }}>
            {interim ? `“${interim}”` : phase === "speaking" || phase === "thinking" ? lines[lines.length - 1]?.text : phase === "listening" ? "Go ahead, I’m listening." : ""}
          </p>
        </div>
      )}

      {active && (
        <>
          <p style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn secondary small" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" className="btn small" style={{ background: "var(--bad, #b3261e)" }} onClick={hangUp}>Hang up</button>
          </p>
          <p style={{ textAlign: "center", marginTop: 8 }}>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={interrupt} onChange={(e) => setInterrupt(e.target.checked)} /> Let me interrupt the agent (headphones only)</label>
          </p>
          {!supported && (
            <form style={{ display: "flex", gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void submit(t); }}>
              <input aria-label="Type a reply as the customer" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="This browser has no speech input. Type here" style={{ flex: 1 }} />
              <button className="btn secondary small" disabled={!typed.trim()}>Send</button>
            </form>
          )}
        </>
      )}

      {phase !== "idle" && (
        <details style={{ marginTop: 12 }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Show transcript</summary>
          <div className="chat" style={{ maxHeight: 220, overflowY: "auto", marginTop: 8 }} role="log">
            {lines.map((l, i) => (
              <div key={i} className={`msg ${l.who === "agent" ? "agent" : "customer"}`}>
                <span className="who">{l.who === "agent" ? "Agent" : "You (customer)"}</span>
                {l.text}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </details>
      )}

      {phase === "ended" && (
        <p style={{ marginTop: 12, textAlign: "center" }}>
          {callId && <Link className="linklike" href={`/calls/${callId}`}>View call details and summary</Link>}
          {" · "}
          <button type="button" className="linklike" onClick={onClose}>Close</button>
        </p>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </div>
  );
}
