"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  pickup_deadline: number; transit_deadline: number; delivery_deadline: number; recovery_deadline: number;
  courier_delivery_checkpoint: number; sender_confirmation_checkpoint: number;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function ManagePage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState("");

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") { setDelivery(parsed); notify("ok", `Delivery #${id} loaded.`); }
    else { setDelivery(null); notify("error", result.error || "Delivery not found."); }
  }

  async function run(label: string, fn: () => Promise<{ success: boolean; hash?: string; error?: string }>, verify = true) {
    setBusy(label); notify("pending", `${label}: waiting…`);
    try {
      const result = await fn();
      if (!result.success) return notify("error", result.error || `${label} failed.`, result.hash);
      if (verify) await refresh();
      notify("ok", `${label} accepted.`, result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(""); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const actions = [
    { label: "Accept (courier)", fn: () => writeContract("accept_delivery", [Number(deliveryId)]) },
    { label: "Fund (sender)", fn: () => writeContract("fund_delivery", [Number(deliveryId)], BigInt("1000000000000000")) },
    { label: "Confirm completion", fn: () => writeContract("confirm_completion", [Number(deliveryId)]) },
    { label: "Open dispute", fn: () => writeContract("open_dispute", [Number(deliveryId)]) },
  ];

  return (
    <div>
      <h1>Manage Delivery</h1>
      <p className="page-desc">Load a delivery by ID and perform lifecycle actions. Accept bonds the courier, fund deposits the fee, confirm completion finalizes payment.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>

        <div className="action-grid">
          {actions.map((a) => (
            <button key={a.label} disabled={!!busy} onClick={() => run(a.label, a.fn)}>{a.label}</button>
          ))}
        </div>
      </div>

      {delivery && (
        <div className="state-card" style={{ marginTop: 24 }}>
          <div className="state-top">
            <span>Authoritative state</span>
            <button onClick={() => refresh()}>Refresh</button>
          </div>
          <div className={statusPill(delivery.status)}>{delivery.status.replace(/_/g, " ")}</div>
          <h3>#{delivery.id} · {delivery.title}</h3>
          <p>{delivery.description}</p>
          <dl>
            <dt>Fee</dt><dd>{(delivery.fee / 1e18).toFixed(4)} GEN</dd>
            <dt>Bond</dt><dd>{(delivery.bond / 1e18).toFixed(4)} GEN</dd>
            <dt>Verdict</dt><dd>{delivery.verdict || "—"}</dd>
            <dt>Courier paid</dt><dd>{(delivery.courier_paid / 1e18).toFixed(4)} GEN</dd>
            <dt>Courier refunded</dt><dd>{(delivery.courier_refunded / 1e18).toFixed(4)} GEN</dd>
            <dt>Sender paid</dt><dd>{(delivery.sender_paid / 1e18).toFixed(4)} GEN</dd>
            <dt>Sender refunded</dt><dd>{(delivery.sender_refunded / 1e18).toFixed(4)} GEN</dd>
            <dt>Courier delivery checkpoint</dt><dd>{delivery.courier_delivery_checkpoint || "None"}</dd>
            <dt>Sender confirmation checkpoint</dt><dd>{delivery.sender_confirmation_checkpoint || "None"}</dd>
          </dl>
          <p className="mono">Sender {delivery.sender}</p>
          <p className="mono">Courier {delivery.courier}</p>
        </div>
      )}

      {!delivery && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <ShieldCheck />
          <p>Enter a delivery ID and click Load to see its on-chain state.</p>
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
