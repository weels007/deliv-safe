"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { writeContract } from "@/lib/genlayer";

type Toast = { kind: "ok" | "error" | "pending"; message: string; hash?: string } | null;

function toWei(v: string): bigint {
  const s = v.trim();
  if (s.includes(".")) return BigInt(Math.round(Number(s) * 1e18));
  return BigInt(s || "0");
}

export default function CreatePage() {
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "Test Package",
    description: "Package delivery from warehouse to customer",
    courier: "",
    fee: "0.01",
    terms_url: "",
    terms_digest: "",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  async function createDelivery() {
    setBusy(true);
    notify("pending", "Create delivery: waiting for contract acceptance…");
    try {
      const result = await writeContract("create_delivery", [
        form.title, form.description, form.courier, toWei(form.fee), form.terms_url, form.terms_digest,
      ]);
      if (result.success) notify("ok", "Delivery created on-chain.", result.hash);
      else notify("error", result.error || "Create delivery failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Create Delivery</h1>
      <p className="page-desc">Lock delivery terms on-chain. The courier, fee, and evidence authority are pinned at creation. Deadlines are set separately via set_schedule.</p>

      <div className="form-card">
        <label>
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="two">
          <label>Fee (GEN)<input placeholder="e.g. 0.01 or 3" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></label>
          <label>Courier wallet<input placeholder="0x…" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })} /></label>
        </div>
        <label>Terms URL<input placeholder="https://ipfs.io/ipfs/…" value={form.terms_url} onChange={(e) => setForm({ ...form, terms_url: e.target.value })} /></label>
        <label>Terms SHA-256 digest<input placeholder="sha256:…" value={form.terms_digest} onChange={(e) => setForm({ ...form, terms_digest: e.target.value })} /></label>
        <button className="blue-btn full" disabled={busy} onClick={createDelivery}>
          Create on-chain <ArrowRight size={18} />
        </button>
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
