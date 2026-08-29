"use client";
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; status: string;
  pickup_deadline: number; transit_deadline: number; delivery_deadline: number; recovery_deadline: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function toTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

async function detectWallet(): Promise<string> {
  try {
    const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0]?.toLowerCase() || "";
  } catch { return ""; }
}

export default function SchedulePage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [form, setForm] = useState({
    pickup: "",
    transit: "",
    delivery: "",
    recovery: "",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  useEffect(() => { detectWallet().then(setWalletAddr); }, []);

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") {
      setDelivery(parsed);
      notify("ok", `Delivery #${id} loaded.`);
    } else {
      setDelivery(null);
      notify("error", result.error || "Delivery not found.");
    }
  }

  const isSender = delivery && walletAddr && walletAddr === delivery.sender.toLowerCase();
  const canSchedule = delivery && isSender && delivery.status === "DELIVERY_OPEN";

  async function setSchedule() {
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
        Number(deliveryId), pickup, transit, deliveryTs, recovery,
      ]);
      if (result.success) {
        await refresh();
        notify("ok", "Schedule locked on-chain.", result.hash);
      } else notify("error", result.error || "Set schedule failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  return (
    <div>
      <h1>Set Schedule</h1>
      <p className="page-desc">Lock deadlines for a delivery. All timestamps must be sequential and in the future. Schedule must be set before the courier can accept.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <div className="two">
          <label>Pickup deadline (date/time)<input type="datetime-local" value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} /></label>
          <label>Transit deadline (date/time)<input type="datetime-local" value={form.transit} onChange={(e) => setForm({ ...form, transit: e.target.value })} /></label>
        </div>
        <div className="two">
          <label>Delivery deadline (date/time)<input type="datetime-local" value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })} /></label>
          <label>Recovery deadline (date/time)<input type="datetime-local" value={form.recovery} onChange={(e) => setForm({ ...form, recovery: e.target.value })} /></label>
        </div>
        <button className="blue-btn full" disabled={busy || !canSchedule} onClick={setSchedule}>
          {busy ? "Processing…" : !delivery ? "Load delivery first" : !walletAddr ? "Wallet not connected" : !isSender ? "You are not the sender" : delivery.status !== "DELIVERY_OPEN" ? `Status: ${delivery.status}` : "Lock schedule on-chain"}
        </button>
      </div>

      {delivery && (
        <div className="state-card" style={{ marginTop: 24 }}>
          <div className="state-top">
            <span>Current state</span>
            <button onClick={() => refresh()}>Refresh</button>
          </div>
          <div className={statusPill(delivery.status)}>{delivery.status.replace(/_/g, " ")}</div>
          <h3>#{delivery.id} · {delivery.title}</h3>
          {isSender && <p>Your role: <strong>SENDER</strong></p>}
          {!isSender && walletAddr && <p>You are not the sender of this delivery.</p>}
          {!walletAddr && <p>Connect your wallet to check your role.</p>}
          <dl>
            <dt>Pickup</dt><dd>{formatTs(delivery.pickup_deadline)}</dd>
            <dt>Transit</dt><dd>{formatTs(delivery.transit_deadline)}</dd>
            <dt>Delivery</dt><dd>{formatTs(delivery.delivery_deadline)}</dd>
            <dt>Recovery</dt><dd>{formatTs(delivery.recovery_deadline)}</dd>
          </dl>
        </div>
      )}

      {!delivery && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <Clock />
          <p>Enter a delivery ID and click Load to see its current schedule.</p>
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
