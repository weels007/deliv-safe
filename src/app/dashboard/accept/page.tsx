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

function toWei(v: string): bigint {
  const s = v.trim();
  if (s.includes(".")) return BigInt(Math.round(Number(s) * 1e18));
  return BigInt(s || "0");
}

export default function AcceptPage() {
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [bondAmount, setBondAmount] = useState("0.01");
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

  async function accept() {
    setBusy(true); notify("pending", "Accept delivery: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const bond = toWei(bondAmount);
      if (bond <= BigInt(0)) return notify("error", "Bond must be greater than 0.");
      const result = await writeContract("accept_delivery", [Number(deliveryId)], bond);
      if (!result.success) return notify("error", result.error || "Accept failed.", result.hash);
      await refresh();
      notify("ok", "Courier accepted delivery.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  function statusPill(status: string) {
    return `status-pill ${deliveryStatusColor[status] || ""}`;
  }

  const isCourier = delivery && walletAddr && walletAddr === delivery.courier.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const canAccept = delivery && isCourier && delivery.status === "DELIVERY_OPEN" && delivery.pickup_deadline > 0 && delivery.pickup_deadline > nowSec;

  return (
    <div>
      <h1>Accept Delivery</h1>
      <p className="page-desc">Courier accepts a delivery and bonds to it. Requires DELIVERY_OPEN status with schedule set. Only the designated courier wallet can accept.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        {delivery && (
          <label>Bond amount (GEN)<input placeholder="e.g. 0.01 or 1" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} /></label>
        )}
        <button className="green-btn full" disabled={!canAccept || !!busy} onClick={accept}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : !delivery ? "Load delivery first" : !isCourier ? "You are not the courier" : delivery.status !== "DELIVERY_OPEN" ? `Status: ${delivery.status}` : !delivery.pickup_deadline ? "Schedule not set" : delivery.pickup_deadline <= nowSec ? "Acceptance closed" : "Accept delivery"}
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
            <dt>Courier</dt><dd className="mono">{delivery.courier}</dd>
          </dl>
          {isCourier && <p>Your role: <strong>COURIER</strong></p>}
          {!isCourier && walletAddr && <p>You are not the designated courier for this delivery.</p>}
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
