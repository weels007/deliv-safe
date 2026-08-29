"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  pickup_deadline: number; recovery_deadline: number;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function RecoverPage() {
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

  async function recover() {
    setBusy(true); notify("pending", "Recover: waiting…");
    try {
      await loadWallet();
      const result = await writeContract("recover", [Number(deliveryId)]);
      if (!result.success) return notify("error", result.error || "Recover failed.", result.hash);
      await refresh();
      notify("ok", "Funds recovered.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const ALLOWED_STATUSES = ["COURIER_ACCEPTED", "IN_TRANSIT", "DELIVERED", "DISPUTED", "RECOVERY", "ADJUDICATED"];
  const isParty = delivery && walletAddr && (walletAddr === delivery.sender.toLowerCase() || walletAddr === delivery.courier.toLowerCase());
  const nowSec = Math.floor(Date.now() / 1000);
  const deadlineOk = delivery
    ? (delivery.status === "COURIER_ACCEPTED" && nowSec > delivery.pickup_deadline)
      || (["IN_TRANSIT", "DELIVERED", "DISPUTED", "RECOVERY"].includes(delivery.status) && nowSec > delivery.recovery_deadline)
      || delivery.status === "ADJUDICATED"
    : false;
  const canRecover = delivery && isParty && ALLOWED_STATUSES.includes(delivery.status) && deadlineOk;

  function recoverLabel() {
    if (!delivery) return "Load delivery first";
    if (!isParty) return "You are not a party";
    if (!ALLOWED_STATUSES.includes(delivery.status)) return `Status: ${delivery.status}`;
    if (delivery.status === "ADJUDICATED") return "Settle payment";
    if (!deadlineOk) return "Recovery not due yet";
    return "Recover funds";
  }

  return (
    <div>
      <h1>Recover Funds</h1>
      <p className="page-desc">If deadlines expire without action, either party can recover their principal. After adjudication, this triggers settlement. Requires appropriate status and expired deadlines.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <button className="orange-btn full" disabled={!canRecover || !!busy} onClick={recover}>
          {busy ? "Processing…" : recoverLabel()}
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
            <dt>Verdict</dt><dd>{delivery.verdict || "—"}</dd>
          </dl>
          {isParty && <p>Your role: <strong>{walletAddr === delivery.sender.toLowerCase() ? "SENDER" : "COURIER"}</strong></p>}
          {!isParty && walletAddr && <p>You are not a party to this delivery.</p>}
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
