# SplitEscrow — System Architecture

## 1. 4-Stage PayPal AI Agent Supervisor Pipeline

```
[Raw Webhook / Buyer Intake Notes]
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 1: PCI-DSS & Financial PII Sanitizer               │
│  • Redacts Bearer tokens, PAN cards, CVVs, ABA/IBAN,     │
│    emails & phone numbers (`scrubFinancialNotesPii`)     │
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 2: Integer-Cent Double-Entry & Hamilton Reconciler │
│  • Reconciles 10,000 bps shares into integer USD cents   │
│  • Largest-Remainder Method fixes odd pennies (`0` drift)│
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 3: Covenant & Dispute Arbitration Solver           │
│  • Enforces HOLD_CHARGEBACK_RISK_FREEZE,                 │
│    HOLD_GROUP_POOL_UNDERFUNDED, HOLD_DELIVERABLE_INCOMP  │
│  • Computes pro-rata contributor refunds & payee splits  │
└──────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────┐
│ Stage 4: PayPal Orders v2 & Payouts Attestation          │
│  • 4,500ms AbortController circuit breaker fallback      │
│  • Seals settlement with FNV-1a-32 (`SPE-PPAL-<8hex>`)   │
│  • Exports JSON Schema 2020-12, Double-Entry CSV & MD    │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Module Map

- **`src/lib/ledger/paypal-escrow-ledger.ts`**: Defines the 4 reference PayPal contracts (`SPE-FREELANCE-FULLSTACK`, `SPE-GROUPBUY-H100-CLUSTER`, `SPE-CREATOR-SPONSOR-SYNDICATE`, `SPE-CROSSBORDER-DESIGN-SPRINT`), Hamilton largest-remainder penny reconciliation (`reconcileBasisPointSharesCents`), double-entry balance calculator (`computeEscrowLedgerBalance`), and PCI/PII intake sanitizer (`scrubFinancialNotesPii`, `verifyZeroFinancialLeakage`).
- **`src/lib/solver/milestone-dispute-solver.ts`**: Implements `solveMilestoneAndDisputeSettlement` and `verifyEscrowConservationLaw` enforcing zero cent drift and strict hold invariants.
- **`src/lib/export/escrow-settlement-exporter.ts`**: Generates PayPal Orders v2 + Payouts JSON Schema Draft 2020-12 payloads, Double-Entry Settlement CSV ledgers, and Markdown Escrow Audit Certificates.
- **`src/lib/paypal/paypal-agent-supervisor.ts`**: Orchestrates the 4-stage pipeline with a `4500ms` `AbortController` circuit breaker and FNV-1a-32 cryptographic attestation (`createEscrowSettlementAttestation`, `verifyEscrowAttestationIntegrity`).
