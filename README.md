# SplitEscrow — Milestone-Locked Freelance & Group-Purchase Checkout Assistant

**SplitEscrow** is an agentic checkout, multiparty escrow, and pro-rata dispute settlement studio built for the **PayPal AI Hackathon** (`$67,500` Prize Pool) on isolated port `http://127.0.0.1:5188` (`strictPort: true`).

---

## Key Capabilities

1. **Integer-Cent Double-Entry Ledger & Hamilton Penny Reconciliation (`src/lib/ledger/paypal-escrow-ledger.ts`)**:
   - Models all currency quantities in integer USD cents (`ISO 4217`) and basis points (`10,000 bps = 100.00%`) across 4 reference contracts (`SPE-FREELANCE-FULLSTACK`, `SPE-GROUPBUY-H100-CLUSTER`, `SPE-CREATOR-SPONSOR-SYNDICATE`, `SPE-CROSSBORDER-DESIGN-SPRINT`).
   - Uses Hamilton's Largest-Remainder Method (`reconcileBasisPointSharesCents`) to allocate odd pennies deterministically (e.g. splitting `$3,333.33` into `$1,111.11`, `$1,111.11`, and `$1,111.11` with `0` cent drift).
   - Scrubs PCI-DSS PAN card numbers, CVVs, ABA/IBAN routing numbers, PayPal `Bearer` tokens, emails, and phone numbers (`scrubFinancialNotesPii`, `verifyZeroFinancialLeakage`).

2. **AI Milestone Verification & Pro-Rata Dispute Solver (`src/lib/solver/milestone-dispute-solver.ts`)**:
   - Enforces hard escrow holds (`HOLD_CHARGEBACK_RISK_FREEZE`, `HOLD_GROUP_POOL_UNDERFUNDED`, `HOLD_DELIVERABLE_INCOMPLETE`, `HOLD_DISPUTE_ARBITRATION_ACTIVE`).
   - Computes exact pro-rata contributor refunds and partial payee settlements verified against `verifyEscrowConservationLaw`.

3. **PayPal Orders v2, Payouts & Double-Entry Exporters (`src/lib/export/escrow-settlement-exporter.ts`)**:
   - Exports JSON Schema Draft 2020-12 PayPal Orders v2 + Multiparty Payouts manifests (`exportPayPalOrdersV2Json`), Double-Entry Settlement CSV ledgers (`exportEscrowLedgerCsv`), and Markdown Escrow Audit Certificates (`exportEscrowContractMarkdown`).

4. **4-Stage PayPal AI Agent Supervisor & FNV-1a-32 Seal (`src/lib/paypal/paypal-agent-supervisor.ts`)**:
   - Runs a `4500ms` `AbortController` circuit breaker (`DECISION_PAYPAL_AGENT_LIVE` vs. `DECISION_LOCAL_SANDBOX_FALLBACK`) and seals every settlement with a tamper-evident `SPE-PPAL-<8hex>` signature.

---

## Quick Start

```bash
# Run 6/6 verification gates
npm test

# Typecheck + run 6/6 gates
npm run check

# Start local studio on http://127.0.0.1:5188
npm run dev
```
