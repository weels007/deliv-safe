"use client";
import { useState } from "react";
import { readContract, writeContract, unwrap, deliveryStatusColor } from "@/lib/genlayer";

type Delivery = {
  id: number; sender: string; courier: string; title: string; status: string;
};

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

const COURIER_KINDS = ["PICKUP_CONFIRMED", "IN_TRANSIT", "DELIVERED"];
const SENDER_KINDS = ["DELIVERY_CONFIRMED", "DAMAGE_REPORT", "COMPLETION_ACK"];
const KIND_LABELS: Record<string, string> = {
  PICKUP_CONFIRMED: "Courier confirms package pickup.",
  IN_TRANSIT: "Courier reports package in transit.",
  DELIVERED: "Courier confirms package delivered.",
  DELIVERY_CONFIRMED: "Sender confirms delivery receipt.",
  DAMAGE_REPORT: "Sender reports damage during delivery.",
  COMPLETION_ACK: "Sender acknowledges delivery completion.",
};

export default function CheckpointPage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [deliveryId, setDeliveryId] = useState("0");
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [walletAddr, setWalletAddr] = useState("");
  const [form, setForm] = useState({
    kind: "PICKUP_CONFIRMED",
    url: "",
    digest: "",
    revision: "1",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function refresh(id = deliveryId) {
    const result = await readContract("get_delivery", [Number(id)]);
    const parsed = result.success ? unwrap<Delivery>(result.data) : null;
    if (parsed && typeof parsed === "object") {
      setDelivery(parsed);
      try {
        const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
        if (accounts?.[0]) setWalletAddr(accounts[0].toLowerCase());
      } catch { /* ignore */ }
      notify("ok", `Delivery #${id} loaded.`);
    } else {
      setDelivery(null);
      notify("error", result.error || "Delivery not found.");
    }
  }

  const myRole = delivery && walletAddr
    ? walletAddr === delivery.courier.toLowerCase() ? "COURIER"
      : walletAddr === delivery.sender.toLowerCase() ? "SENDER"
      : null
    : null;

  const allowedKinds = myRole === "COURIER" ? COURIER_KINDS : myRole === "SENDER" ? SENDER_KINDS : [];

  const canRecord = delivery && myRole && (delivery.status === "IN_TRANSIT" || delivery.status === "DELIVERED");

  async function recordCheckpoint() {
    if (!canRecord) return;
    setBusy(true);
    notify("pending", "Record checkpoint: waiting…");
    try {
      const result = await writeContract("record_checkpoint", [
        Number(deliveryId), form.kind, form.url, form.digest, Number(form.revision),
      ]);
      if (result.success) notify("ok", "Checkpoint recorded.", result.hash);
      else notify("error", result.error || "Failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Record Checkpoint</h1>
      <p className="page-desc">Append an immutable evidence checkpoint to a delivery. Each checkpoint preserves actor, role, URL, digest, and revision.</p>

      <div className="form-card">
        <div className="lookup">
          <input value={deliveryId} onChange={(e) => setDeliveryId(e.target.value)} placeholder="Delivery ID" />
          <button onClick={() => refresh()}>Load</button>
        </div>
        {delivery && myRole && (
          <>
            <label>
              Checkpoint type ({myRole})
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {allowedKinds.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>Revision<input value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} /></label>
            <label>Immutable evidence URL<input placeholder="https://ipfs.io/ipfs/QmHash..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
            <label>SHA-256 digest<input placeholder="sha256: + 64 hex characters" value={form.digest} onChange={(e) => setForm({ ...form, digest: e.target.value })} /></label>
          </>
        )}
        <button className="blue-btn full" disabled={!canRecord || busy} onClick={recordCheckpoint}>
          {busy ? "Processing…" : !delivery ? "Load delivery first" : !myRole ? "You are not a party" : delivery.status !== "IN_TRANSIT" && delivery.status !== "DELIVERED" ? `Status: ${delivery.status}` : "Record checkpoint"}
        </button>
      </div>

      {delivery && (
        <div className="state-card" style={{ marginTop: 24 }}>
          <div className="state-top">
            <span>Authoritative state</span>
            <button onClick={() => refresh()}>Refresh</button>
          </div>
          <div className={`status-pill ${deliveryStatusColor[delivery.status] || ""}`}>{delivery.status.replace(/_/g, " ")}</div>
          <h3>#{delivery.id} · {delivery.title}</h3>
          {myRole && <p>Your role: <strong>{myRole}</strong></p>}
          {!myRole && walletAddr && <p>You are not a party to this delivery.</p>}
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
