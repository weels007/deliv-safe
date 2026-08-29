"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function RecoverPage() {
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
        ["COURIER_ACCEPTED", "IN_TRANSIT", "DELIVERED", "DISPUTED", "RECOVERY", "ADJUDICATED"].includes(d.status) &&
        (d.courier.toLowerCase() === addr || d.sender.toLowerCase() === addr)
      );
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function recover() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Recover: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const result = await writeContract("recover", [selected.id]);
      if (!result.success) return notify("error", result.error || "Recover failed.", result.hash);
      await loadDeliveries();
      notify("ok", "Funds recovered.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const ALLOWED_STATUSES = ["COURIER_ACCEPTED", "IN_TRANSIT", "DELIVERED", "DISPUTED", "RECOVERY", "ADJUDICATED"];
  const nowSec = Math.floor(Date.now() / 1000);
  const deadlineOk = selected
    ? (selected.status === "COURIER_ACCEPTED" && nowSec > selected.pickup_deadline)
      || (["IN_TRANSIT", "DELIVERED", "DISPUTED", "RECOVERY"].includes(selected.status) && nowSec > selected.recovery_deadline)
      || selected.status === "ADJUDICATED"
    : false;
  const canRecover = selected && ALLOWED_STATUSES.includes(selected.status) && deadlineOk;

  function recoverLabel() {
    if (!walletAddr) return "Wallet not connected";
    if (deliveries.length === 0) return "No eligible deliveries";
    if (!selected) return "Select a delivery";
    if (!ALLOWED_STATUSES.includes(selected.status)) return `Status: ${selected.status}`;
    if (selected.status === "ADJUDICATED") return "Settle payment";
    if (!deadlineOk) return "Recovery not due yet";
    return "Recover funds";
  }

  return (
    <div>
      <h1>Recover Funds</h1>
      <p className="page-desc">If deadlines expire without action, either party can recover their principal. After adjudication, this triggers settlement. Requires appropriate status and expired deadlines.</p>

      <div className="form-card">
        <label>
          Select a delivery (COURIER_ACCEPTED through ADJUDICATED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <button className="orange-btn full" disabled={!canRecover || !!busy} onClick={recover}>
          {busy ? "Processing…" : recoverLabel()}
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
            <dt>Pickup deadline</dt><dd>{formatTs(selected.pickup_deadline)}</dd>
            <dt>Recovery deadline</dt><dd>{formatTs(selected.recovery_deadline)}</dd>
          </dl>
          {walletAddr && <p>Your role: <strong>{walletAddr === selected.sender.toLowerCase() ? "SENDER" : walletAddr === selected.courier.toLowerCase() ? "COURIER" : "—"}</strong></p>}
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No eligible deliveries found for your wallet."}</p>
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
