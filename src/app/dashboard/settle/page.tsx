"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function SettlePage() {
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
      const mine = all.filter(d => d.status === "ADJUDICATED");
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function settle() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Settle: waiting…");
    try {
      const result = await writeContract("settle", [selected.id]);
      if (!result.success) return notify("error", result.error || "Settle failed.", result.hash);
      await loadDeliveries();
      notify("ok", "Payment settled.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  return (
    <div>
      <h1>Settle Payment</h1>
      <p className="page-desc">Based on the jury verdict, payment is distributed: full payout, partial, or refund. Requires ADJUDICATED status.</p>

      <div className="form-card">
        <label>
          Select a delivery (ADJUDICATED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <button className="green-btn full" disabled={!selected || selected.status !== "ADJUDICATED" || !!busy} onClick={settle}>
          {busy ? "Processing…" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : selected.status !== "ADJUDICATED" ? `Status: ${selected.status}` : "Settle payment"}
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
            <dt>Verdict</dt><dd>{selected.verdict || "—"}</dd>
          </dl>
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>No ADJUDICATED deliveries found.</p>
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
