"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

function toWei(v: string): bigint {
  const s = v.trim();
  if (s.includes(".")) return BigInt(Math.round(Number(s) * 1e18));
  return BigInt(s || "0");
}

export default function AcceptPage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingList, setLoadingList] = useState(true);
  const [bondAmount, setBondAmount] = useState("0.01");

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  const selected = deliveries.find(d => d.id === Number(selectedId)) || null;

  async function loadDeliveries() {
    setLoadingList(true);
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const all = await fetchDeliveries();
      const mine = all.filter(d =>
        d.status === "DELIVERY_OPEN" &&
        d.courier.toLowerCase() === addr &&
        d.pickup_deadline > 0
      );
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function accept() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Accept delivery: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const bond = toWei(bondAmount);
      if (bond <= BigInt(0)) return notify("error", "Bond must be greater than 0.");
      const result = await writeContract("accept_delivery", [selected.id], bond);
      if (!result.success) return notify("error", result.error || "Accept failed.", result.hash);
      await loadDeliveries();
      notify("ok", "Courier accepted delivery.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const canAccept = selected && selected.status === "DELIVERY_OPEN" && selected.pickup_deadline > nowSec;

  return (
    <div>
      <h1>Accept Delivery</h1>
      <p className="page-desc">Courier accepts a delivery and bonds to it. Requires DELIVERY_OPEN status with schedule set. Only the designated courier wallet can accept.</p>

      <div className="form-card">
        <label>
          Select your delivery (DELIVERY_OPEN, courier assigned)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        {selected && (
          <label>Bond amount (GEN)<input placeholder="e.g. 0.01 or 1" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} /></label>
        )}
        <button className="green-btn full" disabled={!canAccept || !!busy} onClick={accept}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : selected.status !== "DELIVERY_OPEN" ? `Status: ${selected.status}` : !selected.pickup_deadline ? "Schedule not set" : selected.pickup_deadline <= nowSec ? "Acceptance closed" : "Accept delivery"}
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
          </dl>
          {walletAddr && walletAddr === selected.courier.toLowerCase() && <p>Your role: <strong>COURIER</strong></p>}
          {walletAddr && walletAddr !== selected.courier.toLowerCase() && <p>You are not the designated courier for this delivery.</p>}
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No DELIVERY_OPEN deliveries found where you are the courier."}</p>
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
