<p align="center">
  <img src="public/favicon.svg" width="80" alt="DelivSafe" />
</p>

<h1 align="center">DelivSafe</h1>

<p align="center">
  <strong>AI-Adjudicated Delivery Escrow on GenLayer</strong>
</p>

<p align="center">
  Smart contract + full-stack frontend for trustless delivery logistics.<br/>
  Immutable checkpoints. Bounded AI jury. Deterministic settlement.
</p>

---

## What is DelivSafe?

DelivSafe is a **decentralized escrow system** for delivery services built on [GenLayer](https://genlayer.com). It replaces trust between sender and courier with **on-chain evidence**, **append-only checkpoints**, and **AI-powered adjudication**.

Instead of relying on a centralized platform to resolve disputes, DelivSafe uses GenLayer's consensus network to evaluate evidence from both parties and render a binding verdict — fully on-chain, fully deterministic.

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Sender     │─────▶│  Smart Contract   │◀─────│    Courier      │
│  (frontend)  │      │  (GenLayer EVM)   │      │   (frontend)    │
└─────────────┘      └────────┬─────────┘      └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  GenLayer Consensus│
                    │  AI Jury (LLM)    │
                    └──────────────────┘
```

**Key principle:** The contract holds funds in escrow. Both parties submit evidence checkpoints. If they agree, settlement is instant. If they dispute, an AI jury evaluates the evidence and renders a verdict.

## How It Works

### Lifecycle

```
CREATE ──▶ SCHEDULE ──▶ ACCEPT ──▶ FUND ──▶ IN TRANSIT ──▶ COMPLETE
   │                      │          │            │              │
   │                      │          │            ▼              │
   │                      │          │        CHECKPOINTS        │
   │                      │          │            │              │
   │                      ▼          ▼            ▼              ▼
   │                  TIMEOUT     TIMEOUT     DISPUTE ──▶ ADJUDICATE ──▶ SETTLE
   │                 (refund)    (recover)       │
   │                                             ▼
   │                                          RECOVERY ──▶ REFUND
   ▼
  DELIVERY_OPEN
```

### Step-by-Step

| Step | Who | Action | What Happens |
|------|-----|--------|-------------|
| 1 | Sender | `create_delivery` | Lock title, description, courier address, fee, and terms on-chain |
| 2 | Sender | `set_schedule` | Set pickup, transit, delivery, and recovery deadlines |
| 3 | Courier | `accept_delivery` | Courier bonds GEN to accept the delivery |
| 4 | Sender | `fund_delivery` | Sender deposits the fee into escrow |
| 5 | Both | `record_checkpoint` | Append immutable evidence (URL + SHA-256 digest) |
| 6 | Sender | `confirm_completion` | Sender confirms receipt → instant payout |
| — | Either | `open_dispute` | Trigger AI jury if parties disagree |
| 7 | Anyone | `adjudicate` | AI evaluates evidence → renders verdict |
| 8 | Anyone | `settle` | Distribute funds based on verdict |

### Timeout Recovery

If a party fails to act before their deadline, the other party can `recover` their funds:

| Scenario | Timeout | Recovery |
|----------|---------|----------|
| Courier accepted, sender never funded | Pickup deadline | Sender gets bond back |
| In transit, courier never delivered | Recovery deadline | Sender gets fee + bond |
| In transit, sender never confirmed | Recovery deadline | Courier gets fee + bond |
| Dispute stalled | Recovery deadline | Sender gets fee, courier gets bond |

## Smart Contract

**Location:** `contracts/DeliveryEscrow.py`

Built with [GenLayer Python SDK](https://docs.genlayer.com) on the GenVM runtime.

### Methods

| Method | Type | Who | Description |
|--------|------|-----|-------------|
| `create_delivery` | write | Sender | Create a new delivery with terms |
| `set_schedule` | write | Sender | Set 4 deadline timestamps |
| `accept_delivery` | write+payable | Courier | Accept and bond GEN |
| `fund_delivery` | write+payable | Sender | Deposit fee into escrow |
| `record_checkpoint` | write | Both | Append evidence checkpoint |
| `confirm_completion` | write | Sender | Finalize and payout |
| `open_dispute` | write | Either | Trigger AI adjudication |
| `adjudicate` | write | Anyone | Run AI jury evaluation |
| `settle` | write | Anyone | Distribute per verdict |
| `recover` | write | Either | Recover after timeout |
| `get_delivery` | view | Anyone | Read delivery state |
| `get_totals` | view | Anyone | Read aggregate stats |

### AI Adjudication

When a dispute is opened, the GenLayer consensus network:

1. **Fetches** the delivery terms, courier evidence, and sender evidence from their IPFS/Arweave URLs
2. **Classifies** 4 bounded facts: `pickup`, `condition`, `delivery`, `sender_response`
3. **Derives** a verdict using a deterministic decision matrix
4. **Never** sees payout amounts or recipients — only factual evidence

**Verdict hierarchy:**

| Priority | Facts | Verdict |
|----------|-------|---------|
| 1 | pickup = NO or condition = LOST | `SENDER_REFUND` |
| 2 | conflict or any UNVERIFIED | `EVIDENCE_CONFLICT` |
| 3 | condition = DAMAGED | `PARTIAL_PAYOUT_50` |
| 4 | delivery = YES and sender = ACCEPTED | `FULL_PAYOUT` |
| 5 | delivery = YES | `PARTIAL_PAYOUT_75` |
| 6 | default | `PARTIAL_PAYOUT_50` |

### Checkpoint Types

| Role | Checkpoint Kind |
|------|----------------|
| Courier | `PICKUP_CONFIRMED`, `IN_TRANSIT`, `DELIVERED` |
| Sender | `DELIVERY_CONFIRMED`, `DAMAGE_REPORT`, `COMPLETION_ACK` |

Each checkpoint stores: actor wallet, role, kind, evidence URL, SHA-256 digest, revision number, and predecessor link.

## Frontend

**Location:** `src/`

Next.js 16 app with 10 independent pages — each contract method gets its own page. No scrolling required.

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page — overview, features, FAQ |
| `/dashboard` | Overview — lifecycle flow, feature cards |
| `/dashboard/create` | Create a new delivery |
| `/dashboard/accept` | Courier accepts delivery |
| `/dashboard/fund` | Sender funds escrow |
| `/dashboard/confirm` | Sender confirms completion |
| `/dashboard/checkpoint` | Record evidence checkpoint |
| `/dashboard/dispute` | Open a dispute |
| `/dashboard/jury` | Run AI jury |
| `/dashboard/settle` | Settle payment |
| `/dashboard/recover` | Recover after timeout |

### Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Pure CSS with custom properties (no Tailwind runtime)
- **Blockchain:** genlayer-js 1.1.8
- **Icons:** lucide-react
- **Network:** GenLayer StudioNet (gasless)

## Getting Started

### Prerequisites

- Node.js 18+
- GenLayer CLI (`npm install -g genlayer`)
- MetaMask or any EVM wallet

### Install

```bash
git clone https://github.com/weels007/deliv-safe.git
cd deliv-safe
npm install
```

### Environment

Create `.env`:

```env
NEXT_PUBLIC_NETWORK=studionet
NEXT_PUBLIC_CONTRACT_ADDRESS=0xDb81af800641A2A4CF3b1215154247db938affDA
NEXT_PUBLIC_EXPLORER_BASE=https://explorer-studio.genlayer.com/address/
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
```

## Deployment

### Vercel

1. Push to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Set environment variables in Vercel dashboard
4. Deploy

### Contract

```bash
genlayer deploy --contract contracts/DeliveryEscrow.py
```

Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env` with the deployed address.

## Project Structure

```
deliv-safe/
├── contracts/
│   └── DeliveryEscrow.py      # Smart contract (GenLayer Python)
├── scripts/
│   ├── run_studionet_lifecycle.py
│   └── run_studionet_dispute.py
├── tests/
│   ├── test_contract_static.py
│   └── test_decision_matrix.py
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page
│   │   ├── globals.css        # Design system
│   │   └── dashboard/
│   │       ├── layout.tsx     # Dashboard shell + sidebar
│   │       ├── page.tsx       # Overview
│   │       ├── create/        # Create delivery
│   │       ├── accept/        # Accept delivery
│   │       ├── fund/          # Fund escrow
│   │       ├── confirm/       # Confirm completion
│   │       ├── checkpoint/    # Record checkpoint
│   │       ├── dispute/       # Open dispute
│   │       ├── jury/          # Run AI jury
│   │       ├── settle/        # Settle payment
│   │       └── recover/       # Recover funds
│   ├── components/
│   │   └── AppShell.tsx       # Landing page component
│   └── lib/
│       └── genlayer.ts        # GenLayer JS provider
├── SPEC.md                    # Full specification
├── package.json
└── .env
```

## Testing

```bash
# Static contract tests
python -m pytest tests/test_contract_static.py -v

# Decision matrix tests
python -m pytest tests/test_decision_matrix.py -v

# Studionet lifecycle test
python scripts/run_studionet_lifecycle.py

# Studionet dispute test
python scripts/run_studionet_dispute.py
```

## Network

**StudioNet** — GenLayer's testing network. Gasless, no tokens required.

- Rate limit: 60 req/min, 1000 req/hr
- Explorer: [explorer-studio.genlayer.com](https://explorer-studio.genlayer.com)
- Contract: `0xDb81af800641A2A4CF3b1215154247db938affDA`

## License

MIT

---

<p align="center">
  Built with <a href="https://genlayer.com">GenLayer</a> — Intelligent Contracts for the AI era.
</p>
