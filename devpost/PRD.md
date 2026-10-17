# SplitEscrow — Product Requirements Document (PRD)

**Track**: PayPal AI Hackathon (`$67,500` Prize Pool) — Agentic Checkout, Multiparty Escrow & Dispute Automation  
**Local Studio Port**: `http://127.0.0.1:5188` (`strictPort: true`)

---

## 1. Problem Statement

Freelance engineering teams, multi-company hardware group-purchase syndicates, and creator sponsorship collectives lose millions of dollars annually to three systemic checkout failures:

1. **Floating-Point Penny Drift in Multiparty Splits**: Splitting an invoice like `$3,333.33` across 3 equal collaborators (`33.33%` each) or refunding a partial dispute across 6 uneven group-buy contributors produces `AMOUNT_MISMATCH` rejections on PayPal Orders v2 `CAPTURE` and Payouts APIs when naive `Math.floor` or IEEE-754 floating-point math drops `1–5` cents.
2. **Premature Disbursement & Underfunded Group Pools**: Standard checkout links capture and disburse funds immediately without verifying whether a group-purchase pool met its minimum funding lock or whether milestone deliverables passed automated acceptance thresholds.
3. **PCI-DSS & Token Leakage into AI Context**: Passing raw webhook logs or buyer messages into an AI checkout agent without deterministic pre-sanitization risks leaking PAN credit card numbers, CVVs, ABA routing numbers, or `Bearer` access tokens.

---

## 2. Solution Overview

**SplitEscrow** is a Milestone-Locked Freelance & Group-Purchase Checkout Assistant built for the **PayPal AI Agent Toolkit, PayPal Orders v2 (`AUTHORIZE` / `CAPTURE`), and PayPal Multiparty Payouts**:

- **Integer-Cent Double-Entry Ledger & Hamilton Largest-Remainder Reconciler**: Models all monetary amounts strictly in integer USD cents (`ISO 4217`) and basis points (`10,000 bps = 100.00%`), distributing odd remainder pennies deterministically so $\sum \text{allocations} \equiv \text{targetPoolCents}$ with `0` cent drift.
- **Deterministic Covenant Locks (`HOLD_*`)**: Blocks premature `CAPTURE` or payout release when a group-buy pool is underfunded (`HOLD_GROUP_POOL_UNDERFUNDED`), when AI deliverable verification falls below contract requirements (`HOLD_DELIVERABLE_INCOMPLETE`), or when chargeback risk exceeds Seller Protection ceilings (`HOLD_CHARGEBACK_RISK_FREEZE`).
- **Pro-Rata Dispute Arbitration Engine**: Computes exact pro-rata contributor refunds and partial payee milestone awards with strict double-entry conservation ($\text{Payees} + \text{Refunds} + \text{Held} + \text{Fee} = \text{Funded Pool}$).
- **Zero-PCI Intake Sanitizer & FNV-1a-32 Settlement Seal**: Scrubs PAN cards, CVVs, bank routing/IBAN strings, PayPal `Bearer` tokens, emails, and phone numbers prior to AI evaluation, and seals every settlement manifest with a tamper-evident `SPE-PPAL-<8hex>` signature.
