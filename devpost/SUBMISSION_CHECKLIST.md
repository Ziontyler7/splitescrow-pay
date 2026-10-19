# SplitEscrow — PayPal AI Hackathon Submission Checklist

- [x] **Gate 1 (`paypal-escrow-ledger.ts`)**: 4 reference PayPal multipartite escrow contracts, deterministic Hamilton largest-remainder penny reconciliation (`$3,333.33` 3-way split & 6-lab group-buy), and PCI-DSS / financial PII sanitizer (`6` redaction categories).
- [x] **Gate 2 (`milestone-dispute-solver.ts`)**: Covenant locks (`HOLD_GROUP_POOL_UNDERFUNDED`, `HOLD_DELIVERABLE_INCOMPLETE`, `HOLD_CHARGEBACK_RISK_FREEZE`, `HOLD_DISPUTE_ARBITRATION_ACTIVE`) and strict zero-cent-drift conservation verification (`verifyEscrowConservationLaw`).
- [x] **Gate 3 (`escrow-settlement-exporter.ts`)**: PayPal Orders v2 + Payouts JSON Schema Draft 2020-12 exporter, Double-Entry Settlement CSV exporter, and Markdown Escrow Audit Certificate exporter.
- [x] **Gate 4 (`paypal-agent-supervisor.ts`)**: 4-stage PayPal AI Agent supervisor pipeline, `4500ms` `AbortController` circuit breaker (`DECISION_LOCAL_SANDBOX_FALLBACK`), and FNV-1a-32 attestation seal (`SPE-PPAL-<8hex>`).
- [x] **Gate 5 (`Port 5188 Strict Isolation & Studio UI`)**: Interactive React 18 + TypeScript studio bound strictly to `http://127.0.0.1:5188` (`strictPort: true`).
- [x] **Gate 6 (`Clean-Room & Zero-CDN Audit`)**: Zero internal terminology leaks across all 18 repository files and zero external `https://` CDN dependencies in `index.html`.

- [x] **`@paypal/agent-toolkit` MCP Server & `PayPal-Request-Id` Idempotency Spec (`PAYPAL_MCP_TOOLKIT`)**: Verified in Gate 4 (`create_order`, `get_order`, `create_payout_batch`) and interactive studio export tab.
