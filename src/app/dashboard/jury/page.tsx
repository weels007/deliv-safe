"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function JuryPage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingList, setLoadingList] = useState(true);

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  const selected = deliveries.find(d => d.id === Number(selectedId)) || null;

  async function loadDeliveries() {
    setLoadingList(true);
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const all = await fetchDeliveries();
      const mine = all.filter(d => d.status === "DISPUTED");
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function adjudicate() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Run jury: waiting…");
    try {
      const result = await writeContract("adjudicate", [selected.id]);
      if (!result.success) return notify("error", result.error || "Jury failed.", result.hash);
      await loadDeliveries();
      notify("ok", "AI jury evaluated. Verdict ready.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const canAdjudicate = selected && selected.status === "DISPUTED" && selected.recovery_deadline > nowSec;

  return (
    <div>
      <h1>Run AI Jury</h1>
      <p className="page-desc">The GenLayer consensus network evaluates all checkpoints and evidence. Requires DISPUTED status and must be done before the recovery deadline.</p>

      <div className="form-card">
        <label>
          Select a delivery (DISPUTED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <button className="blue-btn full" disabled={!canAdjudicate || !!busy} onClick={adjudicate}>
          {busy ? "Processing…" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : selected.status !== "DISPUTED" ? `Status: ${selected.status}` : selected.recovery_deadline <= nowSec ? "Deadline passed" : "Run jury"}
        </button>
      </div>

      {selected && (
        <div className="state-card" style={{ marginTop: 24 }}>
          <div className="state-top">
            <span>Selected delivery</span>
            <button onClick={() => loadDeliveries()}>Refresh</button>
          </div>
          <div className={statusPill(selected.status)}>{selected.status.replace(/_/g, " ")}</div>
          <h3>#{selected.id} · {selected.title}</h3>
          <p>{selected.description}</p>
          <dl>
            <dt>Fee</dt><dd>{(selected.fee / 1e18).toFixed(4)} GEN</dd>
            <dt>Recovery deadline</dt><dd>{formatTs(selected.recovery_deadline)}</dd>
            <dt>Verdict</dt><dd>{selected.verdict || "—"}</dd>
          </dl>
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>No DISPUTED deliveries found.</p>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.kind}`}>
          <strong>{toast.kind === "ok" ? "Verified" : toast.kind === "pending" ? "Processing" : "Failed"}</strong>
          <span>{toast.message}</span>
          {toast.hash && <small>{toast.hash.slice(0, 12)}…{toast.hash.slice(-8)}</small>}
        </div>
      )}
    </div>
  );
}
