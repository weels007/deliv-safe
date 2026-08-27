# DeliveryEscrow Specification

## Invariants

1. Only the stored courier may accept and bond a delivery.
2. Only the stored sender may fund, schedule, or confirm completion.
3. Sender funding must equal the locked fee exactly.
4. Every checkpoint is append-only and role-bound; a later revision must strictly increase.
5. A dispute requires a courier DELIVERY checkpoint and a sender confirmation checkpoint; pickup or in-transit evidence is not delivery.
6. AI facts never contain a payout amount or recipient.
7. Paying and non-paying outcomes can never be consensus-equivalent.
8. Settlement and recovery are terminal and idempotent.
9. `total_held` decreases by exactly the value reserved by that delivery at terminal settlement.
10. A conflict or unverified fact cannot authorize a payout verdict.
11. Every funded nonterminal state has a deadline-based terminal exit.
12. `total_deposited = total_held + total_paid + total_refunded` after every terminal path.
13. Courier earnings, courier bond refunds, sender compensation, and sender fee refunds are stored separately.

## Timeout settlement matrix

| State holding GEN | Due after | Evidence condition | Courier earned | Courier bond returned | Sender compensation | Sender fee refunded | Verdict |
|---|---|---|---|---|---|---|---|
| `COURIER_ACCEPTED` | pickup deadline | sender did not fund | 0 | bond | 0 | 0 | `SENDER_NON_FUNDING` |
| `IN_TRANSIT` | recovery deadline | no courier delivery | 0 | 0 | bond | fee | `COURIER_DELIVERY_DEFAULT` |
| `IN_TRANSIT` | recovery deadline | delivery exists, no sender response | fee | bond | 0 | 0 | `SENDER_CONFIRMATION_DEFAULT` |
| `IN_TRANSIT` | recovery deadline | both roles submitted, no terminal action | 0 | bond | 0 | fee | `EVIDENCE_RECOVERY` |
| `DISPUTED` | recovery deadline | adjudication stalled/failed | 0 | bond | 0 | fee | `ADJUDICATION_TIMEOUT` |
| `RECOVERY` | recovery deadline | conflict/unavailable evidence | 0 | bond | 0 | fee | `EVIDENCE_RECOVERY` |
| `ADJUDICATED` | immediate | locked bounded verdict | deterministic share | bond | 0 | remaining fee | locked verdict |

## Decision matrix

| Precedence | Bounded facts | Derived result |
|---|---|---|
| 1 | pickup = NO or condition = LOST | `SENDER_REFUND` |
| 2 | conflict = YES or any fact UNVERIFIED | `EVIDENCE_CONFLICT` |
| 3 | condition = DAMAGED | `PARTIAL_PAYOUT_50` |
| 4 | delivery = YES and sender_response = ACCEPTED | `FULL_PAYOUT` |
| 5 | delivery = YES | `PARTIAL_PAYOUT_75` |
| 6 | default | `PARTIAL_PAYOUT_50` |

## Consensus binding matrix

| Field | Origin | Persisted | Downstream effect | Binding |
|---|---|---|---|---|
| pickup | semantic classifier | yes | refund eligibility | exact enum |
| condition | semantic classifier | yes | payout band | exact enum |
| delivery | semantic classifier | yes | full-payout eligibility | exact enum |
| sender_response | semantic classifier | yes | full-payout eligibility | exact enum |
| verdict | deterministic derivation | yes | settlement | derived only |
| payout amount | deterministic arithmetic | yes | transfer | never supplied by AI |

## Contract-level timeout tests

Direct Mode tests execute the actual contract class and assert authoritative readback for:

- sender non-funding after courier bond;
- missing courier delivery and bond compensation to the sender;
- missing sender response after courier delivery;
- stalled adjudication;
- conflicting-evidence recovery;
- an already adjudicated verdict routed to deterministic settlement;
- early, outsider, and duplicate recovery rejection;
- pickup evidence not being accepted as delivery;
- deadline entry points failing closed;
- value conservation and zero held balance at terminal state.

## Evidence authority

The contract accepts only immutable gateway forms and stores exact URLs, SHA-256 declarations, actor wallet, source role, checkpoint kind, revision, and predecessor. Production deployments should additionally pin approved gateway hosts and booking-provider signatures. URL allowlisting alone is not claimed as proof of event truth.

## Resource bounds

- Titles: 4–100 characters.
- Descriptions: 10–500 characters.
- Evidence URLs: at most 500 characters.
- Jury input: at most 5,000 rendered characters per source.
- Jury output: four closed enums only.
- Public write methods never scan historical delivery or checkpoint counts.
