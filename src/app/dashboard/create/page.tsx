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
    title: "",
    description: "",
    courier: "",
    fee: "0.01",
    terms_url: "",
    terms_digest: "",
  });

  const notify = (kind: "ok" | "error" | "pending", message: string, hash?: string) => setToast({ kind, message, hash });

  function validate(): string | null {
    if (form.title.length < 4) return "Title must be at least 4 characters.";
    if (form.title.length > 100) return "Title must be at most 100 characters.";
    if (form.description.length < 10) return "Description must be at least 10 characters.";
    if (form.description.length > 500) return "Description must be at most 500 characters.";
    if (!form.courier.startsWith("0x") || form.courier.length !== 42) return "Courier must be a valid 0x address (42 characters).";
    if (toWei(form.fee) <= BigInt(0)) return "Fee must be greater than 0.";
    if (!form.terms_url.startsWith("https://ipfs.io/ipfs/") && !form.terms_url.startsWith("https://gateway.pinata.cloud/ipfs/") && !form.terms_url.startsWith("https://arweave.net/")) return "Terms URL must start with https://ipfs.io/ipfs/, https://gateway.pinata.cloud/ipfs/, or https://arweave.net/.";
    if (!form.terms_digest.startsWith("sha256:") || form.terms_digest.length !== 71) return "Terms digest must be sha256: followed by 64 hex characters.";
    return null;
  }

  async function createDelivery() {
    const err = validate();
    if (err) return notify("error", err);
    setBusy(true);
    notify("pending", "Create delivery: waiting for contract acceptance…");
    try {
      const result = await writeContract("create_delivery", [
        form.title, form.description, form.courier, toWei(form.fee), form.terms_url, form.terms_digest,
      ]);
      if (result.success) notify("ok", "Delivery created on-chain. Next: set schedule.", result.hash);
      else notify("error", result.error || "Create delivery failed.", result.hash);
    } catch (e) { notify("error", e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Create Delivery</h1>
      <p className="page-desc">Lock delivery terms on-chain. The courier, fee, and evidence authority are pinned at creation. Deadlines are set separately via Set Schedule.</p>

      <div className="form-card">
        <label>
          Title (4–100 chars)
          <input placeholder="e.g. Express laptop delivery" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Description (10–500 chars)
          <input placeholder="e.g. Package delivery from warehouse to customer address" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="two">
          <label>Fee (GEN)<input placeholder="e.g. 0.01 or 3" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></label>
          <label>Courier wallet (0x address)<input placeholder="0x1234...abcd (42 chars)" value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })} /></label>
        </div>
        <label>Terms URL<input placeholder="https://ipfs.io/ipfs/QmHash..." value={form.terms_url} onChange={(e) => setForm({ ...form, terms_url: e.target.value })} /></label>
        <label>Terms SHA-256 digest<input placeholder="sha256: + 64 hex characters" value={form.terms_digest} onChange={(e) => setForm({ ...form, terms_digest: e.target.value })} /></label>
        <button className="blue-btn full" disabled={busy || !!validate()} onClick={createDelivery}>
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
