"use client";
import { useState, useEffect } from "react";
import { writeContract, deliveryStatusColor, fetchDeliveries, detectWallet, type DeliverySummary } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function formatTs(ts: number) {
  if (!ts) return "Not set";
  return new Date(ts * 1000).toLocaleString();
}

const COURIER_KINDS = ["PICKUP_CONFIRMED", "IN_TRANSIT", "DELIVERED"];
const SENDER_KINDS = ["DELIVERY_CONFIRMED", "DAMAGE_REPORT", "COMPLETION_ACK"];

export default function CheckpointPage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [walletAddr, setWalletAddr] = useState("");
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingList, setLoadingList] = useState(true);
  const [form, setForm] = useState({
    kind: "PICKUP_CONFIRMED",
    url: "",
    digest: "",
    revision: "1",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  const selected = deliveries.find(d => d.id === Number(selectedId)) || null;

  async function loadDeliveries() {
    setLoadingList(true);
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const all = await fetchDeliveries();
      const mine = all.filter(d =>
        (d.status === "IN_TRANSIT" || d.status === "DELIVERED") &&
        (d.courier.toLowerCase() === addr || d.sender.toLowerCase() === addr)
      );
      setDeliveries(mine);
      if (mine.length > 0 && !selectedId) setSelectedId(String(mine[0].id));
    } catch { /* ignore */ }
    setLoadingList(false);
  }

  useEffect(() => { loadDeliveries(); }, []);

  const myRole = selected && walletAddr
    ? walletAddr === selected.courier.toLowerCase() ? "COURIER"
      : walletAddr === selected.sender.toLowerCase() ? "SENDER"
      : null
    : null;

  const allowedKinds = myRole === "COURIER" ? COURIER_KINDS : myRole === "SENDER" ? SENDER_KINDS : [];

  const nowSec = Math.floor(Date.now() / 1000);
  const deadlineOk = myRole === "COURIER"
    ? selected ? selected.transit_deadline > nowSec : false
    : myRole === "SENDER"
    ? selected ? selected.delivery_deadline > nowSec : false
    : false;
  const revisionValid = Number(form.revision) >= 1;
  const canRecord = selected && myRole && (selected.status === "IN_TRANSIT" || selected.status === "DELIVERED") && deadlineOk && revisionValid;

  async function recordCheckpoint() {
    if (!canRecord) return;
    setBusy(true);
    notify("pending", "Record checkpoint: waiting…");
    try {
      const addr = await detectWallet();
      if (addr) setWalletAddr(addr);
      const result = await writeContract("record_checkpoint", [
        selected.id, form.kind, form.url, form.digest, Number(form.revision),
      ]);
      if (result.success) notify("ok", "Checkpoint recorded.", result.hash);
      else notify("error", result.error || "Failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Record Checkpoint</h1>
      <p className="page-desc">Append an immutable evidence checkpoint to a delivery. Each checkpoint preserves actor, role, URL, digest, and revision. Courier evidence must be before transit deadline; sender evidence before delivery deadline.</p>

      <div className="form-card">
        <label>
          Select a delivery (IN_TRANSIT or DELIVERED)
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingList}>
            <option value="">{loadingList ? "Loading…" : deliveries.length === 0 ? "No eligible deliveries" : "Choose a delivery…"}</option>
            {deliveries.map(d => (
              <option key={d.id} value={d.id}>#{d.id} — {d.title}</option>
            ))}
          </select>
        </label>
        {selected && myRole && (
          <>
            <label>
              Checkpoint type ({myRole})
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {allowedKinds.map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>Revision (min 1)<input type="number" min="1" value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} /></label>
            <label>Immutable evidence URL<input placeholder="https://ipfs.io/ipfs/QmHash..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
            <label>SHA-256 digest<input placeholder="sha256: + 64 hex characters" value={form.digest} onChange={(e) => setForm({ ...form, digest: e.target.value })} /></label>
          </>
        )}
        <button className="blue-btn full" disabled={!canRecord || busy} onClick={recordCheckpoint}>
          {busy ? "Processing…" : !walletAddr ? "Wallet not connected" : deliveries.length === 0 ? "No eligible deliveries" : !selected ? "Select a delivery" : !myRole ? "You are not a party" : selected.status !== "IN_TRANSIT" && selected.status !== "DELIVERED" ? `Status: ${selected.status}` : !deadlineOk ? "Deadline passed" : !revisionValid ? "Revision must be ≥ 1" : "Record checkpoint"}
        </button>
      </div>

      {selected && (
        <div className="state-card" style={{ marginTop: 24 }}>
          <div className="state-top">
            <span>Selected delivery</span>
            <button onClick={() => loadDeliveries()}>Refresh</button>
          </div>
          <div className={`status-pill ${deliveryStatusColor[selected.status] || ""}`}>{selected.status.replace(/_/g, " ")}</div>
          <h3>#{selected.id} · {selected.title}</h3>
          <dl>
            <dt>Courier</dt><dd className="mono">{selected.courier}</dd>
            <dt>Sender</dt><dd className="mono">{selected.sender}</dd>
            <dt>Transit deadline</dt><dd>{formatTs(selected.transit_deadline)}</dd>
            <dt>Delivery deadline</dt><dd>{formatTs(selected.delivery_deadline)}</dd>
          </dl>
          {myRole && <p>Your role: <strong>{myRole}</strong></p>}
          {!myRole && walletAddr && <p>You are not a party to this delivery.</p>}
        </div>
      )}

      {!selected && !loadingList && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <p>{!walletAddr ? "Connect your wallet to see your deliveries." : "No IN_TRANSIT or DELIVERED deliveries found where you are a party."}</p>
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
