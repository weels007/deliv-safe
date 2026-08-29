"use client";
import { useEffect, useState } from "react";
import { Package, PlusCircle, ClipboardList, MapPin, Scale, ArrowRight, Clock, BarChart3 } from "lucide-react";
import Link from "next/link";
import { readContract, unwrap } from "@/lib/genlayer";

type Totals = {
  deliveries: number;
  checkpoints: number;
  deposited: number;
  held: number;
  paid: number;
  refunded: number;
};

const features = [
  {
    icon: PlusCircle,
    title: "Create Delivery",
    desc: "Lock delivery terms on-chain with fee, courier, and deadlines.",
    href: "/dashboard/create",
    color: "#2563eb",
  },
  {
    icon: Clock,
    title: "Set Schedule",
    desc: "Set pickup, transit, delivery, and recovery deadlines.",
    href: "/dashboard/schedule",
    color: "#2563eb",
  },
  {
    icon: ClipboardList,
    title: "Accept Delivery",
    desc: "Courier accepts a delivery and bonds to it.",
    href: "/dashboard/accept",
    color: "#059669",
  },
  {
    icon: ClipboardList,
    title: "Fund Delivery",
    desc: "Sender deposits the fee into escrow.",
    href: "/dashboard/fund",
    color: "#059669",
  },
  {
    icon: ClipboardList,
    title: "Confirm Completion",
    desc: "Sender confirms receipt and finalizes payment.",
    href: "/dashboard/confirm",
    color: "#059669",
  },
  {
    icon: MapPin,
    title: "Record Checkpoint",
    desc: "Append immutable evidence with URL, digest, and revision number.",
    href: "/dashboard/checkpoint",
    color: "#d97706",
  },
  {
    icon: Scale,
    title: "Open Dispute",
    desc: "Open a dispute and trigger the AI jury evaluation.",
    href: "/dashboard/dispute",
    color: "#dc2626",
  },
  {
    icon: Scale,
    title: "Run Jury",
    desc: "The GenLayer consensus network evaluates all evidence.",
    href: "/dashboard/jury",
    color: "#dc2626",
  },
  {
    icon: Scale,
    title: "Settle Payment",
    desc: "Payment distributed based on jury verdict.",
    href: "/dashboard/settle",
    color: "#dc2626",
  },
  {
    icon: Scale,
    title: "Recover Funds",
    desc: "Recover principal after deadline expiration.",
    href: "/dashboard/recover",
    color: "#dc2626",
  },
];

function fmt(wei: number) {
  return (wei / 1e18).toFixed(4);
}

export default function DashboardOverview() {
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const result = await readContract("get_totals", []);
        const parsed = result.success ? unwrap<Totals>(result.data) : null;
        if (parsed) setTotals(parsed);
      } catch { /* ignore */ }
    }
    load();
  }, []);

  return (
    <div className="dash-overview">
      <h1>Workspace</h1>
      <p className="dash-overview-sub">Select a feature to interact with the DelivSafe contract on GenLayer.</p>

      {totals && (
        <div className="totals-bar">
          <div className="totals-item">
            <BarChart3 size={18} />
            <div>
              <strong>{totals.deliveries}</strong>
              <span>Deliveries</span>
            </div>
          </div>
          <div className="totals-item">
            <MapPin size={18} />
            <div>
              <strong>{totals.checkpoints}</strong>
              <span>Checkpoints</span>
            </div>
          </div>
          <div className="totals-item">
            <span className="totals-gen">{fmt(totals.deposited)} GEN</span>
            <span>Deposited</span>
          </div>
          <div className="totals-item">
            <span className="totals-gen">{fmt(totals.held)} GEN</span>
            <span>Held</span>
          </div>
          <div className="totals-item">
            <span className="totals-gen">{fmt(totals.paid)} GEN</span>
            <span>Paid</span>
          </div>
          <div className="totals-item">
            <span className="totals-gen">{fmt(totals.refunded)} GEN</span>
            <span>Refunded</span>
          </div>
        </div>
      )}

      <div className="feature-grid">
        {features.map((f) => (
          <Link key={f.href} href={f.href} className="feature-card">
            <div className="feature-icon" style={{ background: f.color + "12", color: f.color }}>
              <f.icon size={24} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <span className="feature-link">Open <ArrowRight size={16} /></span>
          </Link>
        ))}
      </div>
      <div className="overview-steps">
        <h2>Lifecycle flow</h2>
        <div className="flow-steps">
          {[
            ["1", "Create", "Sender locks title, fee, courier, and terms on-chain."],
            ["2", "Schedule", "Sender sets pickup, transit, delivery, and recovery deadlines."],
            ["3", "Accept", "Courier accepts the delivery and bonds to it."],
            ["4", "Fund", "Sender deposits the fee into escrow."],
            ["5", "Checkpoints", "Both parties record evidence checkpoints during the lifecycle."],
            ["6", "Complete", "Sender confirms receipt, or either party opens a dispute."],
            ["7", "Settle", "Payment released via confirmation, adjudication, or recovery."],
          ].map(([n, t, d]) => (
            <div key={n} className="flow-step">
              <span className="flow-num">{n}</span>
              <div>
                <strong>{t}</strong>
                <p>{d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
