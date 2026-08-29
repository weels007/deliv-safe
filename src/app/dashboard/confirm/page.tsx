"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  delivery_deadline: number; courier_delivery_checkpoint: number;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function ConfirmPage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function detectWallet(): Promise<string> {
    try {
      const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
      return accounts?.[0]?.toLowerCase() || "";
    } catch { return ""; }
  }

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") { setDelivery(parsed); notify("ok", `Delivery #${id} loaded.`); }
    else { setDelivery(null); notify("error", result.error || "Delivery not found."); }
  }

  useEffect(() => { detectWallet().then(setWalletAddr); }, []);

  async function confirm() {
    setBusy(true); notify("pending", "Confirm completion: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
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

  const isSender = delivery && walletAddr && walletAddr === delivery.sender.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const canConfirm = delivery && isSender
    && (delivery.status === "IN_TRANSIT" || delivery.status === "DELIVERED")
    && delivery.delivery_deadline > nowSec
    && delivery.courier_delivery_checkpoint > 0;

  return (
    <div>
      <h1>Confirm Completion</h1>
      <p className="page-desc">Sender confirms receipt and finalizes payment. Requires IN_TRANSIT or DELIVERED status, a courier delivery checkpoint, and must be done before the delivery deadline.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <button className="green-btn full" disabled={!canConfirm || !!busy} onClick={confirm}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : !delivery ? "Load delivery first" : !isSender ? "You are not the sender" : delivery.status !== "IN_TRANSIT" && delivery.status !== "DELIVERED" ? `Status: ${delivery.status}` : delivery.courier_delivery_checkpoint <= 0 ? "No courier delivery checkpoint" : delivery.delivery_deadline <= nowSec ? "Deadline passed" : "Confirm completion"}
        </button>
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
            <dt>Courier delivery checkpoint</dt><dd>{delivery.courier_delivery_checkpoint > 0 ? `#${delivery.courier_delivery_checkpoint}` : "None"}</dd>
            <dt>Courier paid</dt><dd>{(delivery.courier_paid / 1e18).toFixed(4)} GEN</dd>
            <dt>Sender paid</dt><dd>{(delivery.sender_paid / 1e18).toFixed(4)} GEN</dd>
          </dl>
          {isSender && <p>Your role: <strong>SENDER</strong></p>}
          {!isSender && walletAddr && <p>You are not the sender of this delivery.</p>}
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
