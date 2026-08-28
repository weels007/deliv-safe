"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function ConfirmPage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") { setDelivery(parsed); notify("ok", `Delivery #${id} loaded.`); }
    else { setDelivery(null); notify("error", result.error || "Delivery not found."); }
  }

  async function confirm() {
    setBusy(true); notify("pending", "Confirm completion: waiting…");
    try {
      const result = await writeContract("confirm_completion", [Number(deliveryId)]);
      if (!result.success) return notify("error", result.error || "Confirm failed.", result.hash);
      await refresh();
      notify("ok", "Completion confirmed. Payment released.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  return (
    <div>
      <h1>Confirm Completion</h1>
      <p className="page-desc">Sender confirms receipt and finalizes payment. Requires FUNDED status.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <button className="green-btn full" disabled={!!busy} onClick={confirm}>{busy ? "Processing…" : "Confirm completion"}</button>
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
            <dt>Courier paid</dt><dd>{(delivery.courier_paid / 1e18).toFixed(4)} GEN</dd>
            <dt>Sender paid</dt><dd>{(delivery.sender_paid / 1e18).toFixed(4)} GEN</dd>
          </dl>
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
