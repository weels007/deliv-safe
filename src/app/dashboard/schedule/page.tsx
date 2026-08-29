"use client";
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function toTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

export default function SchedulePage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingList, setLoadingList] = useState(true);
  const [form, setForm] = useState({ pickup: "", transit: "", delivery: "", recovery: "" });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  const selected = deliveries.find(d => d.id === Number(selectedId)) || null;

  async function loadDeliveries() {
    setLoadingList(true);
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const all = await fetchDeliveries();
      const mine = all.filter(d => d.status === "DELIVERY_OPEN" && d.sender.toLowerCase() === addr);
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  async function setSchedule() {
    if (!selected) return;
    setBusy(true);
    notify("pending", "Set schedule: waiting…");
    try {
      const pickup = toTimestamp(form.pickup);
      const transit = toTimestamp(form.transit);
      const deliveryTs = toTimestamp(form.delivery);
      const recovery = toTimestamp(form.recovery);
      const now = Math.floor(Date.now() / 1000);

      if (pickup <= now) return notify("error", "Pickup deadline must be in the future.");
      if (transit <= pickup) return notify("error", "Transit deadline must be after pickup deadline.");
      if (deliveryTs <= transit) return notify("error", "Delivery deadline must be after transit deadline.");
      if (recovery <= deliveryTs) return notify("error", "Recovery deadline must be after delivery deadline.");

      const result = await writeContract("set_schedule", [
        selected.id, pickup, transit, deliveryTs, recovery,
      ]);
      if (result.success) {
        await loadDeliveries();
        notify("ok", "Schedule locked on-chain.", result.hash);
      } else notify("error", result.error || "Set schedule failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const canSchedule = selected && selected.status === "DELIVERY_OPEN";

  return (
    <div>
      <h1>Set Schedule</h1>
      <p className="page-desc">Lock deadlines for a delivery. All timestamps must be sequential and in the future. Schedule must be set before the courier can accept.</p>

      <div className="form-card">
        <label>
          Select your delivery (DELIVERY_OPEN)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        <div className="two">
          <label>Pickup deadline (date/time)<input type="datetime-local" value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} /></label>
          <label>Transit deadline (date/time)<input type="datetime-local" value={form.transit} onChange={(e) => setForm({ ...form, transit: e.target.value })} /></label>
        </div>
        <div className="two">
          <label>Delivery deadline (date/time)<input type="datetime-local" value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })} /></label>
          <label>Recovery deadline (date/time)<input type="datetime-local" value={form.recovery} onChange={(e) => setForm({ ...form, recovery: e.target.value })} /></label>
        </div>
        <button className="blue-btn full" disabled={busy || !canSchedule} onClick={setSchedule}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : "Lock schedule on-chain"}
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
            <dt>Courier</dt><dd className="mono">{selected.courier}</dd>
            <dt>Fee</dt><dd>{(selected.fee / 1e18).toFixed(4)} GEN</dd>
            <dt>Pickup</dt><dd>{formatTs(selected.pickup_deadline)}</dd>
            <dt>Transit</dt><dd>{formatTs(selected.transit_deadline)}</dd>
            <dt>Delivery</dt><dd>{formatTs(selected.delivery_deadline)}</dd>
            <dt>Recovery</dt><dd>{formatTs(selected.recovery_deadline)}</dd>
          </dl>
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <Clock />
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No DELIVERY_OPEN deliveries found for your wallet."}</p>
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
