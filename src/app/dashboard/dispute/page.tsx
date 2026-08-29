"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function DisputePage() {
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
      const mine = all.filter(d =>
        (d.status === "IN_TRANSIT" || d.status === "DELIVERED") &&
        (d.courier.toLowerCase() === addr || d.sender.toLowerCase() === addr)
      );
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function openDispute() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Open dispute: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const result = await writeContract("open_dispute", [selected.id]);
      if (!result.success) return notify("error", result.error || "Dispute failed.", result.hash);
      await loadDeliveries();
      notify("ok", "Dispute opened. AI jury will evaluate.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const hasBothCheckpoints = selected && selected.courier_delivery_checkpoint > 0 && selected.sender_confirmation_checkpoint > 0;
  const canDispute = selected
    && (selected.status === "IN_TRANSIT" || selected.status === "DELIVERED")
    && selected.recovery_deadline > nowSec
    && hasBothCheckpoints;

  return (
    <div>
      <h1>Open Dispute</h1>
      <p className="page-desc">Either party can open a dispute after both courier and sender evidence checkpoints exist. Must be done before the recovery deadline. Triggers the AI jury evaluation.</p>

      <div className="form-card">
        <label>
          Select a delivery (IN_TRANSIT or DELIVERED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <button className="red-btn full" disabled={!canDispute || !!busy} onClick={openDispute}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : selected.status !== "IN_TRANSIT" && selected.status !== "DELIVERED" ? `Status: ${selected.status}` : !hasBothCheckpoints ? "Both checkpoints required" : selected.recovery_deadline <= nowSec ? "Deadline passed" : "Open dispute"}
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
            <dt>Courier checkpoint</dt><dd>{selected.courier_delivery_checkpoint > 0 ? `#${selected.courier_delivery_checkpoint}` : "None"}</dd>
            <dt>Sender checkpoint</dt><dd>{selected.sender_confirmation_checkpoint > 0 ? `#${selected.sender_confirmation_checkpoint}` : "None"}</dd>
            <dt>Recovery deadline</dt><dd>{formatTs(selected.recovery_deadline)}</dd>
            <dt>Verdict</dt><dd>{selected.verdict || "—"}</dd>
          </dl>
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No IN_TRANSIT or DELIVERED deliveries found where you are a party."}</p>
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
