"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  recovery_deadline: number; courier_delivery_checkpoint: number; sender_confirmation_checkpoint: number;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function DisputePage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function loadWallet() {
    try {
      const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
      if (accounts?.[0]) setWalletAddr(accounts[0].toLowerCase());
    } catch { /* ignore */ }
  }

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") { setDelivery(parsed); notify("ok", `Delivery #${id} loaded.`); }
    else { setDelivery(null); notify("error", result.error || "Delivery not found."); }
  }

  useEffect(() => { loadWallet(); }, []);

  async function openDispute() {
    setBusy(true); notify("pending", "Open dispute: waiting…");
    try {
      await loadWallet();
      const result = await writeContract("open_dispute", [Number(deliveryId)]);
      if (!result.success) return notify("error", result.error || "Dispute failed.", result.hash);
      await refresh();
      notify("ok", "Dispute opened. AI jury will evaluate.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const isParty = delivery && walletAddr && (walletAddr === delivery.sender.toLowerCase() || walletAddr === delivery.courier.toLowerCase());
  const nowSec = Math.floor(Date.now() / 1000);
  const hasBothCheckpoints = delivery && delivery.courier_delivery_checkpoint > 0 && delivery.sender_confirmation_checkpoint > 0;
  const canDispute = delivery && isParty
    && (delivery.status === "IN_TRANSIT" || delivery.status === "DELIVERED")
    && delivery.recovery_deadline > nowSec
    && hasBothCheckpoints;

  return (
    <div>
      <h1>Open Dispute</h1>
      <p className="page-desc">Either party can open a dispute after both courier and sender evidence checkpoints exist. Must be done before the recovery deadline. Triggers the AI jury evaluation.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <button className="red-btn full" disabled={!canDispute || !!busy} onClick={openDispute}>
          {busy ? "Processing…" : !delivery ? "Load delivery first" : !isParty ? "You are not a party" : delivery.status !== "IN_TRANSIT" && delivery.status !== "DELIVERED" ? `Status: ${delivery.status}` : !hasBothCheckpoints ? "Both checkpoints required" : delivery.recovery_deadline <= nowSec ? "Deadline passed" : "Open dispute"}
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
            <dt>Courier checkpoint</dt><dd>{delivery.courier_delivery_checkpoint > 0 ? `#${delivery.courier_delivery_checkpoint}` : "None"}</dd>
            <dt>Sender checkpoint</dt><dd>{delivery.sender_confirmation_checkpoint > 0 ? `#${delivery.sender_confirmation_checkpoint}` : "None"}</dd>
            <dt>Verdict</dt><dd>{delivery.verdict || "—"}</dd>
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
