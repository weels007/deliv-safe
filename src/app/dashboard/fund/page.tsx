"use client";
import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; description: string;
  fee: number; bond: number; status: string; verdict: string;
  pickup_deadline: number;
  courier_paid: number; courier_refunded: number; sender_paid: number; sender_refunded: number;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function FundPage() {
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

  async function fund() {
    setBusy(true); notify("pending", "Fund delivery: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const result = await writeContract("fund_delivery", [Number(deliveryId)], delivery ? BigInt(delivery.fee) : BigInt(0));
      if (!result.success) return notify("error", result.error || "Fund failed.", result.hash);
      await refresh();
      notify("ok", "Fee deposited into escrow.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const isSender = delivery && walletAddr && walletAddr === delivery.sender.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const canFund = delivery && isSender && delivery.status === "COURIER_ACCEPTED" && delivery.pickup_deadline > nowSec;

  return (
    <div>
      <h1>Fund Delivery</h1>
      <p className="page-desc">Sender deposits the delivery fee into escrow. Requires COURIER_ACCEPTED status and must be done before the pickup deadline. Only the sender wallet can fund.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        <button className="blue-btn full" disabled={!canFund || !!busy} onClick={fund}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : !delivery ? "Load delivery first" : !isSender ? "You are not the sender" : delivery.status !== "COURIER_ACCEPTED" ? `Status: ${delivery.status}` : delivery.pickup_deadline <= nowSec ? "Funding closed" : `Fund ${(delivery.fee / 1e18).toFixed(4)} GEN`}
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
            <dt>Bond</dt><dd>{(delivery.bond / 1e18).toFixed(4)} GEN</dd>
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
