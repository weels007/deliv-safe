"use client";
import { useState } from "react";
import { writeContract } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

export default function CheckpointPage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    deliveryId: "0",
    kind: "PICKUP_CONFIRMED",
    url: "",
    digest: "",
    revision: "1",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function recordCheckpoint() {
    setBusy(true);
    notify("pending", "Record checkpoint: waiting…");
    try {
      const result = await writeContract("record_checkpoint", [
        Number(form.deliveryId), form.kind, form.url, form.digest, Number(form.revision),
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
        <label>Delivery ID<input value={form.deliveryId} onChange={(e) => setForm({ ...form, deliveryId: e.target.value })} /></label>
        <div className="two">
          <label>
            Checkpoint type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {["PICKUP_CONFIRMED", "IN_TRANSIT", "DELIVERED", "DELIVERY_CONFIRMED", "DAMAGE_REPORT", "COMPLETION_ACK"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>Revision<input value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} /></label>
        </div>
        <label>Immutable evidence URL<input placeholder="https://ipfs.io/ipfs/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
        <label>SHA-256 digest<input placeholder="sha256:…" value={form.digest} onChange={(e) => setForm({ ...form, digest: e.target.value })} /></label>
        <button className="blue-btn full" disabled={busy} onClick={recordCheckpoint}>
          Record checkpoint
        </button>
      </div>

      <div className="checkpoint-types">
        <h3>Checkpoint types</h3>
        <div className="type-list">
          {[
            ["PICKUP_CONFIRMED", "Courier confirms package pickup."],
            ["IN_TRANSIT", "Courier reports package in transit."],
            ["DELIVERED", "Courier confirms package delivered."],
            ["DELIVERY_CONFIRMED", "Sender confirms delivery receipt."],
            ["DAMAGE_REPORT", "Sender reports damage during delivery."],
            ["COMPLETION_ACK", "Sender acknowledges delivery completion."],
          ].map(([t, d]) => (
            <div key={t} className="type-item">
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>

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
