"use client";
import { useEffect, useState } from "react";
import { Package, ExternalLink, Wallet, X, LayoutDashboard, PlusCircle, ClipboardList, MapPin, Scale, ArrowLeft } from "lucide-react";
import { connectWallet, explorerUrl } from "@/lib/genlayer";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();
  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet";

  useEffect(() => {
    async function autoConnect() {
      if (wallet) return;
      try {
        const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
        if (accounts?.[0]) setWallet(accounts[0]);
      } catch { /* not connected */ }
    }
    autoConnect();
  }, [wallet]);

  async function connect() {
    const result = await connectWallet();
    if (result.success) setWallet(String(result.data));
  }

  const navSections = [
    {
      label: "Overview",
      items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }],
    },
    {
      label: "Lifecycle",
      items: [
        { href: "/dashboard/create", label: "Create Delivery", icon: PlusCircle },
        { href: "/dashboard/accept", label: "Accept", icon: ClipboardList },
        { href: "/dashboard/fund", label: "Fund", icon: ClipboardList },
        { href: "/dashboard/confirm", label: "Confirm", icon: ClipboardList },
        { href: "/dashboard/checkpoint", label: "Record Checkpoint", icon: MapPin },
      ],
    },
    {
      label: "Dispute",
      items: [
        { href: "/dashboard/dispute", label: "Open Dispute", icon: Scale },
        { href: "/dashboard/jury", label: "Run Jury", icon: Scale },
        { href: "/dashboard/settle", label: "Settle", icon: Scale },
        { href: "/dashboard/recover", label: "Recover", icon: Scale },
      ],
    },
  ];

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <div className="dash-wrap">
      <nav className="dash-topbar">
        <div className="dash-topbar-left">
          <Link href="/" className="icon-btn" title="Back to home"><ArrowLeft size={18} /></Link>
          <a className="brand" href="/">
            <span className="brand-mark"><Package size={20} /></span>
            <span>DelivSafe</span>
          </a>
        </div>
        <div className="dash-topbar-right">
          <a className="icon-btn" href={explorerUrl()} target="_blank" rel="noreferrer" title="Open contract in Explorer">
            <ExternalLink size={18} />
          </a>
          <button className="dark-btn" onClick={connect}>
            <Wallet size={16} />{shortWallet}
          </button>
          <button className="icon-btn mobile-menu-btn" onClick={() => setMobileNav(!mobileNav)}>
            {mobileNav ? <X size={18} /> : <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>}
          </button>
        </div>
      </nav>

      {mobileNav && (
        <div className="mobile-nav-overlay" onClick={() => setMobileNav(false)}>
          <div className="mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
            {navSections.map((section) => (
              <div key={section.label}>
                <div className="mobile-nav-section">{section.label}</div>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-nav-item ${isActive(item.href) ? "active" : ""}`}
                    onClick={() => setMobileNav(false)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dash-body">
        <aside className="dash-sidebar">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section">{section.label}</div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`dash-nav-item ${isActive(item.href) ? "active" : ""}`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </aside>
        <main className="dash-main">
          {children}
        </main>
      </div>
    </div>
  );
}
