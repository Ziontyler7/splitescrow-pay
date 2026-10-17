import { useMemo, useState } from 'react';
import {
  ESCROW_CONTRACT_TEMPLATES,
  type EscrowContractId,
  computeEscrowLedgerBalance,
  formatUsdFromCents,
  getEscrowContractById,
  scrubFinancialNotesPii,
  verifyZeroFinancialLeakage,
} from './lib/ledger/paypal-escrow-ledger.ts';
import {
  type DisputeArbitrationMode,
  type EscrowPolicyInput,
  solveMilestoneAndDisputeSettlement,
  verifyEscrowConservationLaw,
} from './lib/solver/milestone-dispute-solver.ts';
import {
  exportEscrowContractMarkdown,
  exportEscrowLedgerCsv,
  exportPayPalOrdersV2Json,
} from './lib/export/escrow-settlement-exporter.ts';
import {
  createEscrowSettlementAttestation,
  verifyEscrowAttestationIntegrity,
} from './lib/paypal/paypal-agent-supervisor.ts';

type ExportTab = 'JSON_ORDERS_V2' | 'CSV_LEDGER' | 'MARKDOWN_CERT';

const DISPUTE_MODE_OPTIONS: readonly {
  value: DisputeArbitrationMode;
  label: string;
  caption: string;
}[] = [
  {
    value: 'NONE',
    label: 'Standard Milestone Release',
    caption: 'Disburse 100% of net pool when funding & deliverable covenants pass',
  },
  {
    value: 'ARBITRATION_SPLIT',
    label: 'Arbitrated Pro-Rata Split',
    caption: 'Split net pool between payees and contributors via Hamilton penny reconciliation',
  },
  {
    value: 'FULL_BUYER_REFUND',
    label: '100% Buyer Pool Refund',
    caption: 'Return 100% of deposited cents pro-rata to contributors with zero fee',
  },
];

export function App() {
  const [selectedContractId, setSelectedContractId] = useState<EscrowContractId>(
    'SPE-FREELANCE-FULLSTACK'
  );
  const [fundedRatioPct, setFundedRatioPct] = useState<number>(100);
  const [deliverableScore, setDeliverableScore] = useState<number>(92);
  const [chargebackRisk, setChargebackRisk] = useState<number>(12);
  const [disputeMode, setDisputeMode] = useState<DisputeArbitrationMode>('NONE');
  const [disputePayeeAwardPct, setDisputePayeeAwardPct] = useState<number>(65);
  const [simulateSandboxFallback, setSimulateSandboxFallback] = useState<boolean>(false);
  const [orderLookupFilter, setOrderLookupFilter] = useState<string>('ORD-PPAL-V2-8841-FRL');
  const [rawEscrowNotes, setRawEscrowNotes] = useState<string>(
    'Webhook auth Bearer A21AAJ98234789234KJHDSF · Fallback card 4532 0151 1283 0366 CVV=842 · Wire ABA=021000021 · Contact buyer@acmelabs.io or (415) 890-4412 before milestone release.'
  );
  const [activeExportTab, setActiveExportTab] = useState<ExportTab>('JSON_ORDERS_V2');
  const [sealedSignature, setSealedSignature] = useState<string | null>(null);

  const activeContract = useMemo(
    () => getEscrowContractById(selectedContractId),
    [selectedContractId]
  );

  const handleSelectContract = (contractId: EscrowContractId) => {
    const next = getEscrowContractById(contractId);
    setSelectedContractId(contractId);
    setFundedRatioPct(Math.round(next.defaultFundedRatioBps / 100));
    setDeliverableScore(next.defaultDeliverableScore);
    setChargebackRisk(next.defaultChargebackRiskScore);
    setDisputeMode('NONE');
    setOrderLookupFilter(next.paypalOrderId);
    setSealedSignature(null);
  };

  const policy: EscrowPolicyInput = useMemo(
    () => ({
      fundedRatioBps: Math.round(fundedRatioPct * 100),
      deliverableVerificationScore: deliverableScore,
      chargebackRiskScore: chargebackRisk,
      disputeMode,
      disputePayeeAwardBps: Math.round(disputePayeeAwardPct * 100),
    }),
    [fundedRatioPct, deliverableScore, chargebackRisk, disputeMode, disputePayeeAwardPct]
  );

  const scrubbedIntake = useMemo(
    () => scrubFinancialNotesPii(rawEscrowNotes),
    [rawEscrowNotes]
  );

  const zeroLeakVerified = useMemo(
    () => verifyZeroFinancialLeakage(scrubbedIntake.sanitizedText),
    [scrubbedIntake.sanitizedText]
  );

  const ledger = useMemo(
    () => computeEscrowLedgerBalance(activeContract, policy.fundedRatioBps),
    [activeContract, policy.fundedRatioBps]
  );

  const settlement = useMemo(
    () => solveMilestoneAndDisputeSettlement(activeContract, ledger, policy),
    [activeContract, ledger, policy]
  );

  const conservationAudit = useMemo(
    () => verifyEscrowConservationLaw(settlement, activeContract, policy),
    [settlement, activeContract, policy]
  );

  const attestation = useMemo(
    () => createEscrowSettlementAttestation(ledger, settlement, policy),
    [ledger, settlement, policy]
  );

  const attestationIntact = useMemo(
    () => verifyEscrowAttestationIntegrity(attestation, ledger, settlement, policy),
    [attestation, ledger, settlement, policy]
  );

  const exportedPreview = useMemo(() => {
    if (activeExportTab === 'JSON_ORDERS_V2') {
      return exportPayPalOrdersV2Json(ledger, settlement, attestation.signature);
    }
    if (activeExportTab === 'CSV_LEDGER') {
      return exportEscrowLedgerCsv(ledger, settlement, attestation.signature);
    }
    return exportEscrowContractMarkdown(ledger, settlement, attestation.signature);
  }, [activeExportTab, ledger, settlement, attestation.signature]);

  const handleDownloadExport = () => {
    const ext =
      activeExportTab === 'JSON_ORDERS_V2'
        ? 'json'
        : activeExportTab === 'CSV_LEDGER'
          ? 'csv'
          : 'md';
    const mime =
      activeExportTab === 'JSON_ORDERS_V2'
        ? 'application/json'
        : activeExportTab === 'CSV_LEDGER'
          ? 'text/csv'
          : 'text/markdown';
    const blob = new Blob([exportedPreview], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${ledger.contractId.toLowerCase()}-${attestation.signature.toLowerCase()}.${ext}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell">
      <header className="top-banner">
        <div>
          <div className="eyebrow-row">
            <span className="pill pill-brand">PayPal AI Agent Toolkit · Orders v2 &amp; Payouts</span>
            <span className="pill pill-mono">Port 5188 Strict Isolation</span>
            <span
              className={`pill ${
                simulateSandboxFallback ? 'pill-warn' : 'pill-ok'
              }`}
            >
              {simulateSandboxFallback
                ? 'DECISION_LOCAL_SANDBOX_FALLBACK (4.5s Circuit Breaker)'
                : 'DECISION_PAYPAL_AGENT_LIVE'}
            </span>
          </div>
          <h1>SplitEscrow — Milestone-Locked Freelance &amp; Group-Purchase Checkout Assistant</h1>
          <p className="subtitle">
            Deterministic integer-cent double-entry escrow accounting, Hamilton largest-remainder
            penny reconciliation, AI deliverable &amp; chargeback lock covenants, and FNV-1a-32
            attested PayPal Orders v2 &amp; Multiparty Payouts.
          </p>
        </div>

        <div className="banner-kpis" aria-live="polite">
          <div className="kpi-card">
            <span className="kpi-label">Funded Escrow Pool</span>
            <strong className="kpi-value">{formatUsdFromCents(settlement.fundedPoolCents)}</strong>
            <span className="kpi-sub">
              Target {formatUsdFromCents(ledger.grossOrderCents)} ({fundedRatioPct}%)
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Conservation Drift</span>
            <strong className="kpi-value">
              {conservationAudit.conservationDeltaCents} ¢
            </strong>
            <span className="kpi-sub">
              {conservationAudit.valid ? 'Double-Entry Verified' : 'Violation Detected'}
            </span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Attestation Seal</span>
            <strong className="kpi-value kpi-mono">{attestation.signature}</strong>
            <span className="kpi-sub">
              {attestationIntact ? 'FNV-1a-32 Intact' : 'Tamper Invalidated'}
            </span>
          </div>
        </div>
      </header>

      <section className="contract-selector" aria-label="Reference Escrow Contracts">
        {ESCROW_CONTRACT_TEMPLATES.map((tpl) => {
          const isSelected = tpl.id === selectedContractId;
          return (
            <button
              key={tpl.id}
              type="button"
              className={`contract-tab ${isSelected ? 'contract-tab-active' : ''}`}
              onClick={() => handleSelectContract(tpl.id)}
            >
              <div className="contract-tab-top">
                <span className="contract-id">{tpl.id}</span>
                <span className="contract-amount">
                  {formatUsdFromCents(tpl.grossOrderCents)}
                </span>
              </div>
              <div className="contract-title">{tpl.title}</div>
              <div className="contract-meta">
                {tpl.contributors.length} Contributor(s) · {tpl.payees.length} Payee(s) ·{' '}
                {tpl.milestones.length} Tranches
              </div>
            </button>
          );
        })}
      </section>

      <main className="studio-grid">
        <section className="panel">
          <h2>1. Escrow Policy, Covenant Controls &amp; PCI Intake Scrubber</h2>
          <form
            method="post"
            action="#escrow-policy-form"
            className="policy-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSealedSignature(attestation.signature);
            }}
          >
            <fieldset className="form-fieldset">
              <legend>PayPal Order Identifier &amp; Circuit Breaker</legend>
              <div className="form-group">
                <label htmlFor="paypal-order-id">
                  PayPal Orders v2 Reference ID
                </label>
                <input
                  id="paypal-order-id"
                  name="paypalOrderId"
                  type="text"
                  value={orderLookupFilter}
                  onChange={(e) => setOrderLookupFilter(e.target.value)}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-describedby="paypal-order-help"
                />
                <span id="paypal-order-help" className="field-hint">
                  Matched to contract order <code>{activeContract.paypalOrderId}</code> (intent:{' '}
                  <code>{settlement.paypalOrderIntent}</code>).
                </span>
              </div>

              <div className="checkbox-row">
                <input
                  id="simulate-fallback"
                  name="simulateSandboxFallback"
                  type="checkbox"
                  checked={simulateSandboxFallback}
                  onChange={(e) => setSimulateSandboxFallback(e.target.checked)}
                />
                <label htmlFor="simulate-fallback">
                  Simulate 4,500ms PayPal Sandbox Timeout (Trip AbortController Circuit Breaker)
                </label>
              </div>
            </fieldset>

            <fieldset className="form-fieldset">
              <legend>Milestone &amp; Pool Lock Covenants</legend>

              <div className="form-group">
                <label htmlFor="funded-ratio-slider">
                  Group-Buy Pool Funded Ratio: <strong>{fundedRatioPct}%</strong> (Minimum Lock:{' '}
                  {(activeContract.minFundingThresholdBps / 100).toFixed(0)}%)
                </label>
                <input
                  id="funded-ratio-slider"
                  name="fundedRatioPct"
                  type="range"
                  min={50}
                  max={100}
                  step={1}
                  value={fundedRatioPct}
                  onChange={(e) => setFundedRatioPct(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="deliverable-score-slider">
                  AI Deliverable Verification Score: <strong>{deliverableScore}/100</strong>{' '}
                  (Required: {activeContract.minDeliverableVerificationScore}/100)
                </label>
                <input
                  id="deliverable-score-slider"
                  name="deliverableScore"
                  type="range"
                  min={40}
                  max={100}
                  step={1}
                  value={deliverableScore}
                  onChange={(e) => setDeliverableScore(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="chargeback-risk-slider">
                  Chargeback &amp; Seller-Protection Risk Score:{' '}
                  <strong>{chargebackRisk}/100</strong> (Max Ceiling:{' '}
                  {activeContract.maxChargebackRiskScore}/100)
                </label>
                <input
                  id="chargeback-risk-slider"
                  name="chargebackRisk"
                  type="range"
                  min={0}
                  max={85}
                  step={1}
                  value={chargebackRisk}
                  onChange={(e) => setChargebackRisk(Number(e.target.value))}
                />
              </div>
            </fieldset>

            <fieldset className="form-fieldset">
              <legend>Dispute Arbitration &amp; Pro-Rata Settlement Mode</legend>
              <div className="radio-stack">
                {DISPUTE_MODE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="radio-card" htmlFor={`mode-${opt.value}`}>
                    <input
                      id={`mode-${opt.value}`}
                      type="radio"
                      name="disputeMode"
                      value={opt.value}
                      checked={disputeMode === opt.value}
                      onChange={() => setDisputeMode(opt.value)}
                    />
                    <div>
                      <strong>{opt.label}</strong>
                      <div className="field-hint">{opt.caption}</div>
                    </div>
                  </label>
                ))}
              </div>

              {disputeMode === 'ARBITRATION_SPLIT' && (
                <div className="form-group">
                  <label htmlFor="arbitration-award-slider">
                    Arbitrated Payee Award Share: <strong>{disputePayeeAwardPct}%</strong> Payees /{' '}
                    <strong>{100 - disputePayeeAwardPct}%</strong> Buyer Pro-Rata Refund
                  </label>
                  <input
                    id="arbitration-award-slider"
                    name="disputePayeeAwardPct"
                    type="range"
                    min={10}
                    max={90}
                    step={5}
                    value={disputePayeeAwardPct}
                    onChange={(e) => setDisputePayeeAwardPct(Number(e.target.value))}
                  />
                </div>
              )}
            </fieldset>

            <fieldset className="form-fieldset">
              <legend>Zero-PCI / Financial PII Intake Sanitizer</legend>
              <div className="form-group">
                <label htmlFor="escrow-intake-notes">
                  Raw Webhook / Milestone Delivery Notes
                </label>
                <textarea
                  id="escrow-intake-notes"
                  name="rawEscrowNotes"
                  rows={3}
                  value={rawEscrowNotes}
                  onChange={(e) => setRawEscrowNotes(e.target.value)}
                  aria-describedby="scrubber-status"
                />
                <div id="scrubber-status" className="scrubber-box" aria-live="polite">
                  <div className="scrubber-header">
                    <span>
                      Redactions: <strong>{scrubbedIntake.redactionCount}</strong> (
                      {scrubbedIntake.redactedCategories.join(', ') || 'NONE'})
                    </span>
                    <span className={zeroLeakVerified ? 'badge-pass' : 'badge-block'}>
                      {zeroLeakVerified ? 'ZERO PCI/PII LEAKAGE VERIFIED' : 'UNSCRUBBED TOKEN'}
                    </span>
                  </div>
                  <code className="scrubbed-preview">{scrubbedIntake.sanitizedText}</code>
                </div>
              </div>
            </fieldset>

            <button type="submit" className="primary-submit-btn">
              Seal Escrow Settlement (FNV-1a-32) · {formatUsdFromCents(settlement.fundedPoolCents)}
            </button>

            {sealedSignature && (
              <div className="seal-confirmation" role="status" aria-live="polite">
                Sealed Settlement Snapshot <code>{sealedSignature}</code> verified with 0 cent
                drift across {ledger.contributorDeposits.length} contributor(s) and{' '}
                {ledger.payeeAllocations.length} payee(s).
              </div>
            )}
          </form>
        </section>

        <section className="panel">
          <h2>2. PayPal Orders v2 Multiparty Escrow &amp; Penny-Reconciliation Flow</h2>

          <div className="svg-flow-container">
            <svg
              viewBox="0 0 680 230"
              className="escrow-flow-svg"
              role="img"
              aria-label="PayPal Orders v2 Multiparty Escrow and Penny-Reconciliation Flow"
            >
              <rect
                x="14"
                y="24"
                width="185"
                height="182"
                rx="12"
                fill="#111c2d"
                stroke="#2b4c7e"
                strokeWidth="1.5"
              />
              <text x="28" y="50" fill="#93c5fd" fontSize="12" fontWeight="700">
                1. CONTRIBUTOR POOL
              </text>
              <text x="28" y="76" fill="#f8fafc" fontSize="18" fontWeight="700">
                {formatUsdFromCents(settlement.fundedPoolCents)}
              </text>
              <text x="28" y="98" fill="#94a3b8" fontSize="11">
                {ledger.contributorDeposits.length} Buyer(s) · {fundedRatioPct}% Funded
              </text>
              <text x="28" y="120" fill="#38bdf8" fontSize="11">
                Odd-Penny Fixes: {ledger.contributorRemainderPennies} ¢
              </text>
              <text x="28" y="146" fill="#cbd5e1" fontSize="11">
                Order: {ledger.paypalOrderId}
              </text>
              <text x="28" y="168" fill="#cbd5e1" fontSize="11">
                Intent: {settlement.paypalOrderIntent}
              </text>

              <line
                x1="199"
                y1="115"
                x2="245"
                y2="115"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeDasharray="5 3"
              />

              <rect
                x="245"
                y="24"
                width="190"
                height="182"
                rx="12"
                fill="#132238"
                stroke={settlement.captureEligible ? '#10b981' : '#f59e0b'}
                strokeWidth="2"
              />
              <text x="260" y="50" fill="#fde68a" fontSize="12" fontWeight="700">
                2. AI ESCROW VAULT LOCK
              </text>
              <text x="260" y="74" fill="#f8fafc" fontSize="13" fontWeight="700">
                {settlement.settlementStatus}
              </text>
              <text x="260" y="98" fill="#94a3b8" fontSize="11">
                Deliverable Score: {deliverableScore}/100
              </text>
              <text x="260" y="118" fill="#94a3b8" fontSize="11">
                Chargeback Risk: {chargebackRisk}/100
              </text>
              <text x="260" y="140" fill="#fbbf24" fontSize="11">
                Held in Vault: {formatUsdFromCents(settlement.heldInEscrowCents)}
              </text>
              <text x="260" y="162" fill="#94a3b8" fontSize="11">
                PayPal Fee: {formatUsdFromCents(settlement.appliedPlatformFeeCents)}
              </text>
              <text x="260" y="184" fill="#38bdf8" fontSize="11">
                Seal: {attestation.signature}
              </text>

              <line
                x1="435"
                y1="115"
                x2="481"
                y2="115"
                stroke={settlement.captureEligible ? '#10b981' : '#f59e0b'}
                strokeWidth="2.5"
              />

              <rect
                x="481"
                y="24"
                width="185"
                height="182"
                rx="12"
                fill="#111c2d"
                stroke="#2b4c7e"
                strokeWidth="1.5"
              />
              <text x="495" y="50" fill="#6ee7b7" fontSize="12" fontWeight="700">
                3. MULTIPARTY SETTLEMENT
              </text>
              <text x="495" y="76" fill="#10b981" fontSize="16" fontWeight="700">
                Payees: {formatUsdFromCents(settlement.totalPayeeDisbursedCents)}
              </text>
              <text x="495" y="102" fill="#38bdf8" fontSize="14" fontWeight="700">
                Refunds: {formatUsdFromCents(settlement.totalContributorRefundedCents)}
              </text>
              <text x="495" y="128" fill="#94a3b8" fontSize="11">
                Payee Penny Fixes: {ledger.payeeRemainderPennies} ¢
              </text>
              <text x="495" y="150" fill="#cbd5e1" fontSize="11">
                Conservation Drift: {conservationAudit.conservationDeltaCents} ¢
              </text>
              <text x="495" y="174" fill="#a7f3d0" fontSize="11">
                {settlement.captureEligible ? 'PAYOUTS BATCH READY' : 'RELEASE BLOCKED BY HOLD'}
              </text>
            </svg>
          </div>

          <div className="diagnostics-block" aria-live="polite">
            <h3>Active Hold &amp; Covenant Diagnostics ({settlement.holdCodes.length})</h3>
            {settlement.holdDiagnostics.length === 0 ? (
              <div className="diagnostic-item diagnostic-ok">
                <strong>ALL COVENANTS VERIFIED (CAPTURED_DISBURSED)</strong> — Funding pool reached{' '}
                {fundedRatioPct}%, deliverable score ({deliverableScore}/100) meets requirement, and
                chargeback risk ({chargebackRisk}/100) is within ceiling.
              </div>
            ) : (
              settlement.holdDiagnostics.map((diag) => (
                <div key={diag.holdCode} className="diagnostic-item diagnostic-hold">
                  <div className="diag-header">
                    <code>{diag.holdCode}</code>
                    <span className="diag-severity">{diag.severity}</span>
                  </div>
                  <p>{diag.summary}</p>
                  <small>{diag.remediationAction}</small>
                </div>
              ))
            )}
          </div>

          <div className="ledger-tables">
            <h3>Multiparty Payee Disbursement Schedule (Hamilton Reconciled)</h3>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Payee Specialist</th>
                    <th>PayPal Merchant ID</th>
                    <th>Share</th>
                    <th>Penny Fix</th>
                    <th>Disbursed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.payeeDisbursements.map((payee) => (
                    <tr key={payee.payeeId}>
                      <td>
                        <strong>{payee.displayName}</strong>
                        <div className="cell-sub">{payee.role}</div>
                      </td>
                      <td>
                        <code>{payee.paypalMerchantId}</code>
                      </td>
                      <td>{(payee.shareBps / 100).toFixed(2)}%</td>
                      <td>+{payee.extraPennyAssigned} ¢</td>
                      <td className="amount-cell">
                        {formatUsdFromCents(payee.disbursedCents)}
                      </td>
                      <td>
                        <span className="status-chip">{payee.payoutStatus}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Contributor Group-Buy Deposits &amp; Pro-Rata Refunds</h3>
            <div className="table-scroll">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Contributor</th>
                    <th>PayPal Payer ID</th>
                    <th>Share</th>
                    <th>Deposited</th>
                    <th>Pro-Rata Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {settlement.contributorRefunds.map((contrib) => (
                    <tr key={contrib.contributorId}>
                      <td>
                        <strong>{contrib.displayName}</strong>
                      </td>
                      <td>
                        <code>{contrib.paypalPayerId}</code>
                      </td>
                      <td>{(contrib.shareBps / 100).toFixed(2)}%</td>
                      <td className="amount-cell">
                        {formatUsdFromCents(contrib.depositedCents)}
                      </td>
                      <td className="amount-cell">
                        {formatUsdFromCents(contrib.refundedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="export-panel">
            <div className="export-header">
              <div className="export-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeExportTab === 'JSON_ORDERS_V2'}
                  className={`export-tab ${
                    activeExportTab === 'JSON_ORDERS_V2' ? 'export-tab-active' : ''
                  }`}
                  onClick={() => setActiveExportTab('JSON_ORDERS_V2')}
                >
                  PayPal Orders v2 JSON
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeExportTab === 'CSV_LEDGER'}
                  className={`export-tab ${
                    activeExportTab === 'CSV_LEDGER' ? 'export-tab-active' : ''
                  }`}
                  onClick={() => setActiveExportTab('CSV_LEDGER')}
                >
                  Double-Entry CSV Ledger
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeExportTab === 'MARKDOWN_CERT'}
                  className={`export-tab ${
                    activeExportTab === 'MARKDOWN_CERT' ? 'export-tab-active' : ''
                  }`}
                  onClick={() => setActiveExportTab('MARKDOWN_CERT')}
                >
                  Markdown Audit Certificate
                </button>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleDownloadExport}
              >
                Download Artifact
              </button>
            </div>
            <pre className="export-code-preview">
              <code>{exportedPreview}</code>
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
