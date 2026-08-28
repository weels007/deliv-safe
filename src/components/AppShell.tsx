"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ExternalLink, ShieldCheck, Package, Wallet } from "lucide-react";
import { connectWallet, explorerUrl } from "@/lib/genlayer";
import Link from "next/link";

export default function AppShell() {
  const [wallet, setWallet] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    async function autoConnect() {
      try {
        const accounts = (await window.ethereum?.request({ method: "eth_accounts" })) as string[];
        if (accounts?.[0]) setWallet(accounts[0]);
      } catch { /* not connected */ }
    }
    autoConnect();

    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const targets = document.querySelectorAll(
      ".section h2, .service-card, .service-strip, .protocol-grid > div, .steps article, .metric-grid article, .faq details, footer .shell"
    );
    targets.forEach((t) => t.classList.add("reveal"));
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in-view"); obs.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: "0px 0px -48px" }
    );
    targets.forEach((t) => obs.observe(t));
    return () => { window.removeEventListener("scroll", onScroll); obs.disconnect(); };
  }, []);

  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet";

  async function connect() {
    const result = await connectWallet();
    if (result.success) setWallet(String(result.data));
  }

  return (
    <main>
      <nav className={`nav shell ${scrolled ? "nav-scrolled" : ""}`}>
        <a className="brand" href="#home">
          <span className="brand-mark"><Package size={22} /></span>
          <span>DelivSafe</span>
        </a>
        <div className="nav-links">
          <a href="#services">Services</a>
          <a href="#protocol">How it works</a>
          <a href="#trust">Trust model</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-actions">
          <a className="icon-btn" href={explorerUrl()} target="_blank" rel="noreferrer" title="Open contract in Explorer">
            <ExternalLink size={19} />
          </a>
          <button className="dark-btn" onClick={connect}>
            <Wallet size={17} />{shortWallet}
          </button>
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-deco" />
        <div className="hero-copy shell">
          <div className="eyebrow">
            <ShieldCheck size={17} /> Checkpoints, not surveillance
          </div>
          <h1>Delivery work,<br />verified fairly.</h1>
          <p>Lock delivery terms, record role-bound checkpoints, and release payment without trusting a single platform operator.</p>
          <div className="hero-buttons">
            <Link href="/dashboard" className="blue-btn">
              Open workspace <ArrowRight size={19} />
            </Link>
            <a className="ghost-btn" href="#protocol">See the protocol</a>
          </div>
        </div>
        <div className="hero-trust">
          <strong>Exception-only jury</strong>
          <span>Happy paths settle without AI</span>
          <div className="trust-row">
            <span className="avatars">DE</span>
            <span>
              <b>4 bounded facts</b>
              <small>deterministic payout</small>
            </span>
          </div>
        </div>
      </section>

      <section className="section shell" id="services">
        <div className="section-kicker">Service templates</div>
        <h2>Designed for deliveries that can<br />be checkpointed clearly.</h2>
        <div className="service-card">
          <span className="service-num">01</span>
          <div className="service-photo" />
          <div className="service-copy">
            <h3>Package pickup &amp; delivery</h3>
            <p>Pickup confirmation, in-transit status, proof of delivery, and sender response — without publishing private delivery details.</p>
            <Link href="/dashboard" className="blue-btn">
              Create delivery <ArrowRight size={18} />
            </Link>
            <div className="chips">
              <span>Same-day</span>
              <span>Express</span>
              <span>Tracked</span>
            </div>
          </div>
        </div>
        <div className="service-strip">
          <span>02</span>
          <div>
            <h3>Freight &amp; bulk</h3>
            <p>Role-bound evidence for scheduled commercial freight deliveries.</p>
          </div>
          <div className="chips">
            <span>Pallet</span>
            <span>Scheduled</span>
            <span>Checklist</span>
          </div>
        </div>
      </section>

      <section className="section shell" id="protocol">
        <div className="protocol-grid">
          <div>
            <div className="section-kicker">How it works</div>
            <h2>Five checkpoints.<br />One bounded outcome.</h2>
            <p>AI never decides how a delivery looks. It only classifies disputed public records into four closed facts.</p>
            <Link href="/dashboard" className="blue-btn">
              Launch workspace <ArrowRight size={18} />
            </Link>
          </div>
          <div className="steps">
            {[
              ["01", "Lock terms", "Sender pins fee, courier, exact evidence authority and deadlines."],
              ["02", "Accept + fund", "Courier bonds the delivery; sender funds the exact fee."],
              ["03", "Attest", "Each party appends role-bound checkpoint revisions."],
              ["04", "Resolve", "Mutual confirmation settles directly; disputes invoke consensus."],
              ["05", "Read back", "Every write is confirmed against authoritative contract state."],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section shell" id="trust">
        <div className="section-kicker center">Why this primitive is different</div>
        <h2 className="center">Consensus only where<br />meaning is ambiguous.</h2>
        <div className="metric-grid">
          <article>
            <span className="metric-icon"><Check /></span>
            <h3>Deterministic happy path</h3>
            <p>Sender confirmation releases fee and returns courier bond without an AI call.</p>
          </article>
          <article className="metric-main">
            <strong>4</strong>
            <h3>Bounded jury facts</h3>
            <p>Pickup, delivery, sender response, and source conflict. No free-form payout.</p>
          </article>
          <article className="metric-blue">
            <h3>Append-only evidence</h3>
            <p>Every revision preserves actor, role, immutable URL, digest, and predecessor.</p>
            <Link href="/dashboard" className="ghost-btn">
              Try the flow <ArrowRight size={18} />
            </Link>
          </article>
        </div>
      </section>

      <section className="section shell faq" id="faq">
        <div className="section-kicker center">FAQ</div>
        <h2 className="center">Transparent by design.</h2>
        {[
          ["Does DelivSafe judge delivery photos?", "No. The MVP deliberately avoids subjective image grading and private delivery imagery."],
          ["When does GenLayer consensus run?", "Only after both parties have submitted role-bound evidence and a dispute is opened."],
          ["What if someone disappears?", "Every funded state has a locked terminal deadline. Non-funding returns the courier bond; missing delivery protects the sender; sender silence pays documented delivery; stalled adjudication returns each principal."],
          ["Is transaction finality treated as success?", "No. The app inspects contract-level rollback payloads and re-reads the affected delivery before reporting verified success."],
        ].map(([q, a], i) => (
          <details key={q} open={i === 0}>
            <summary>{q}<span>+</span></summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <footer>
        <div className="shell">
          <a className="brand" href="#home">
            <span className="brand-mark"><Package size={22} /></span>
            DelivSafe
          </a>
          <p>Checkpoint-based delivery verification on GenLayer.</p>
        </div>
      </footer>
    </main>
  );
}
