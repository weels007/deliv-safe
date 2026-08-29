"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function FundPage() {
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
        d.status === "COURIER_ACCEPTED" &&
        d.sender.toLowerCase() === addr
      );
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function fund() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Fund delivery: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const result = await writeContract("fund_delivery", [selected.id], BigInt(selected.fee));
      if (!result.success) return notify("error", result.error || "Fund failed.", result.hash);
      await loadDeliveries();
      notify("ok", "Fee deposited into escrow.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const canFund = selected && selected.status === "COURIER_ACCEPTED" && selected.pickup_deadline > nowSec;

  return (
    <div>
      <h1>Fund Delivery</h1>
      <p className="page-desc">Sender deposits the delivery fee into escrow. Requires COURIER_ACCEPTED status and must be done before the pickup deadline. Only the sender wallet can fund.</p>

      <div className="form-card">
        <label>
          Select your delivery (COURIER_ACCEPTED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <button className="blue-btn full" disabled={!canFund || !!busy} onClick={fund}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : selected.status !== "COURIER_ACCEPTED" ? `Status: ${selected.status}` : selected.pickup_deadline <= nowSec ? "Funding closed" : `Fund ${(selected.fee / 1e18).toFixed(4)} GEN`}
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
            <dt>Bond</dt><dd>{(selected.bond / 1e18).toFixed(4)} GEN</dd>
            <dt>Courier</dt><dd className="mono">{selected.courier}</dd>
            <dt>Pickup</dt><dd>{formatTs(selected.pickup_deadline)}</dd>
          </dl>
          {walletAddr && walletAddr === selected.sender.toLowerCase() && <p>Your role: <strong>SENDER</strong></p>}
          {walletAddr && walletAddr !== selected.sender.toLowerCase() && <p>You are not the sender of this delivery.</p>}
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No COURIER_ACCEPTED deliveries found for your wallet."}</p>
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
