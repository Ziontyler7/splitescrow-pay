import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ESCROW_CONTRACT_TEMPLATES,
  computeEscrowLedgerBalance,
  formatUsdFromCents,
  getEscrowContractById,
  reconcileBasisPointSharesCents,
  scrubFinancialNotesPii,
  verifyZeroFinancialLeakage,
} from '../lib/ledger/paypal-escrow-ledger.ts';
import {
  solveMilestoneAndDisputeSettlement,
  verifyEscrowConservationLaw,
} from '../lib/solver/milestone-dispute-solver.ts';
import {
  exportEscrowContractMarkdown,
  exportEscrowLedgerCsv,
  exportPayPalOrdersV2Json,
} from '../lib/export/escrow-settlement-exporter.ts';
import {
  createEscrowSettlementAttestation,
  runPayPalAgentSupervisorPipeline,
  verifyEscrowAttestationIntegrity,
} from '../lib/paypal/paypal-agent-supervisor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

test('Gate 1: PayPal Orders v2 Integer-Cent Ledger, Hamilton Penny Reconciliation & PCI/PII Scrubber', () => {
  assert.equal(
    ESCROW_CONTRACT_TEMPLATES.length,
    4,
    'Must provide 4 reference PayPal multipartite escrow contracts'
  );

  // 1. Test $3,333.33 (333,333 cents) 3-way split (3334 / 3333 / 3333 bps) -> [111133, 111100, 111100] with 2 remainder pennies distributed & 0 drift
  const oddPennyContract = getEscrowContractById('SPE-CREATOR-SPONSOR-SYNDICATE');
  const oddPennyLedger = computeEscrowLedgerBalance(oddPennyContract, 10000);
  assert.equal(oddPennyLedger.grossOrderCents, 333333);
  assert.equal(oddPennyLedger.netEscrowPoolCents, 333333);
  assert.equal(oddPennyLedger.payeeRemainderPennies, 2);
  assert.equal(oddPennyLedger.doubleEntryBalanced, true);
  assert.deepEqual(
    oddPennyLedger.payeeAllocations.map((p) => p.targetNetCents),
    [111133, 111100, 111100],
    '$3,333.33 split across 3334/3333/3333 bps must reconcile to [111133, 111100, 111100] cents via Hamilton largest-remainder'
  );

  // 2. Test direct Hamilton largest-remainder penny distribution on 100 cents across 3334/3333/3333 bps
  const hundredCentSplit = reconcileBasisPointSharesCents(100, [
    { id: 'P1', shareBps: 3334 },
    { id: 'P2', shareBps: 3333 },
    { id: 'P3', shareBps: 3333 },
  ]);
  assert.equal(hundredCentSplit.totalAllocatedCents, 100);
  assert.equal(hundredCentSplit.remainderPenniesDistributed, 1);
  assert.deepEqual(
    hundredCentSplit.allocations.map((a) => a.allocatedCents),
    [34, 33, 33]
  );

  // 3. Test 6-contributor group-buy pool ($10,000.00 = 1,000,000 cents) at 87.65% funding
  const groupBuyContract = getEscrowContractById('SPE-GROUPBUY-H100-CLUSTER');
  const groupBuyLedger = computeEscrowLedgerBalance(groupBuyContract, 8765);
  assert.equal(groupBuyLedger.fundedPoolCents, 876500);
  assert.equal(groupBuyLedger.doubleEntryBalanced, true);
  assert.equal(
    groupBuyLedger.contributorDeposits.reduce((acc, c) => acc + c.depositedCents, 0),
    876500
  );
  assert.equal(formatUsdFromCents(876500), '$8,765.00');

  // 4. Test PCI-DSS & Financial PII Scrubber across all 6 sensitive categories
  const dirtyFinancialText =
    'Auth Bearer A21AAK998123456789TOKEN card 4532-0151-1283-0366 CVV: 901 wire ABA=021000021 buyer@company.org (415) 555-0199';
  const scrubbed = scrubFinancialNotesPii(dirtyFinancialText);
  assert.equal(scrubbed.redactionCount, 6);
  assert.equal(verifyZeroFinancialLeakage(scrubbed.sanitizedText), true);
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_PAYPAL_BEARER_TOKEN]'));
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_PCI_PAN]'));
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_PCI_CVV]'));
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_BANK_ROUTING]'));
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_EMAIL]'));
  assert.ok(scrubbed.sanitizedText.includes('[REDACTED_PHONE]'));
});

test('Gate 2: Milestone Verification, Covenant Hold Locks & Pro-Rata Dispute Conservation Law', () => {
  // 1. Standard Freelance contract passing all covenants -> CAPTURED_DISBURSED
  const freelance = getEscrowContractById('SPE-FREELANCE-FULLSTACK');
  const freelanceLedger = computeEscrowLedgerBalance(freelance, 10000);
  const passPolicy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 95,
    chargebackRiskScore: 10,
    disputeMode: 'NONE' as const,
    disputePayeeAwardBps: 6500,
  };
  const passSettlement = solveMilestoneAndDisputeSettlement(
    freelance,
    freelanceLedger,
    passPolicy
  );
  assert.equal(passSettlement.settlementStatus, 'CAPTURED_DISBURSED');
  assert.equal(passSettlement.captureEligible, true);
  assert.equal(passSettlement.totalPayeeDisbursedCents, freelanceLedger.netEscrowPoolCents);
  assert.equal(passSettlement.heldInEscrowCents, 0);
  assert.equal(
    verifyEscrowConservationLaw(passSettlement, freelance, passPolicy).valid,
    true
  );

  // 2. Underfunded Group-Buy Pool (80% funded vs 100% required) -> HOLD_GROUP_POOL_UNDERFUNDED
  const groupBuy = getEscrowContractById('SPE-GROUPBUY-H100-CLUSTER');
  const underfundedLedger = computeEscrowLedgerBalance(groupBuy, 8000);
  const underfundedPolicy = {
    fundedRatioBps: 8000,
    deliverableVerificationScore: 92,
    chargebackRiskScore: 12,
    disputeMode: 'NONE' as const,
    disputePayeeAwardBps: 5000,
  };
  const underfundedSettlement = solveMilestoneAndDisputeSettlement(
    groupBuy,
    underfundedLedger,
    underfundedPolicy
  );
  assert.equal(underfundedSettlement.settlementStatus, 'ESCROW_LOCKED_HOLD');
  assert.equal(underfundedSettlement.captureEligible, false);
  assert.ok(underfundedSettlement.holdCodes.includes('HOLD_GROUP_POOL_UNDERFUNDED'));
  assert.equal(underfundedSettlement.totalPayeeDisbursedCents, 0);
  assert.equal(underfundedSettlement.heldInEscrowCents, underfundedLedger.fundedPoolCents);
  assert.equal(
    verifyEscrowConservationLaw(underfundedSettlement, groupBuy, underfundedPolicy).valid,
    true
  );

  // 3. Incomplete Deliverable (62/100 vs 80/100 required) -> HOLD_DELIVERABLE_INCOMPLETE
  const incompletePolicy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 62,
    chargebackRiskScore: 12,
    disputeMode: 'NONE' as const,
    disputePayeeAwardBps: 5000,
  };
  const incompleteSettlement = solveMilestoneAndDisputeSettlement(
    freelance,
    freelanceLedger,
    incompletePolicy
  );
  assert.equal(incompleteSettlement.settlementStatus, 'ESCROW_LOCKED_HOLD');
  assert.ok(incompleteSettlement.holdCodes.includes('HOLD_DELIVERABLE_INCOMPLETE'));
  assert.equal(incompleteSettlement.totalPayeeDisbursedCents, 0);
  assert.equal(
    verifyEscrowConservationLaw(incompleteSettlement, freelance, incompletePolicy).valid,
    true
  );

  // 4. Elevated Chargeback Risk (55/100 vs 35/100 ceiling) -> HOLD_CHARGEBACK_RISK_FREEZE
  const riskPolicy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 95,
    chargebackRiskScore: 55,
    disputeMode: 'NONE' as const,
    disputePayeeAwardBps: 5000,
  };
  const riskSettlement = solveMilestoneAndDisputeSettlement(
    freelance,
    freelanceLedger,
    riskPolicy
  );
  assert.equal(riskSettlement.settlementStatus, 'ESCROW_LOCKED_HOLD');
  assert.ok(riskSettlement.holdCodes.includes('HOLD_CHARGEBACK_RISK_FREEZE'));
  assert.equal(riskSettlement.totalPayeeDisbursedCents, 0);
  assert.equal(
    verifyEscrowConservationLaw(riskSettlement, freelance, riskPolicy).valid,
    true
  );

  // 5. Arbitrated Pro-Rata Dispute Split (65% to payees / 35% refunded across 6 uneven contributors)
  const fullGroupLedger = computeEscrowLedgerBalance(groupBuy, 10000);
  const splitPolicy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 70,
    chargebackRiskScore: 15,
    disputeMode: 'ARBITRATION_SPLIT' as const,
    disputePayeeAwardBps: 6500,
  };
  const splitSettlement = solveMilestoneAndDisputeSettlement(
    groupBuy,
    fullGroupLedger,
    splitPolicy
  );
  assert.equal(splitSettlement.settlementStatus, 'DISPUTE_PRO_RATA_SETTLED');
  assert.equal(splitSettlement.conservationBalanced, true);
  assert.ok(splitSettlement.totalPayeeDisbursedCents > 0);
  assert.ok(splitSettlement.totalContributorRefundedCents > 0);
  assert.equal(
    splitSettlement.totalPayeeDisbursedCents +
      splitSettlement.totalContributorRefundedCents +
      splitSettlement.appliedPlatformFeeCents,
    fullGroupLedger.fundedPoolCents,
    'Arbitrated split must conserve every single cent across payees, contributor refunds, and platform fee'
  );
  assert.equal(
    verifyEscrowConservationLaw(splitSettlement, groupBuy, splitPolicy).valid,
    true
  );
});

test('Gate 3: PayPal Orders v2 JSON Schema 2020-12, Double-Entry CSV & Markdown Certificate Exporters', () => {
  const groupBuy = getEscrowContractById('SPE-GROUPBUY-H100-CLUSTER');
  const ledger = computeEscrowLedgerBalance(groupBuy, 10000);
  const policy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 90,
    chargebackRiskScore: 15,
    disputeMode: 'ARBITRATION_SPLIT' as const,
    disputePayeeAwardBps: 6000,
  };
  const settlement = solveMilestoneAndDisputeSettlement(groupBuy, ledger, policy);
  const seal = 'SPE-PPAL-ABCD1234';

  const jsonStr = exportPayPalOrdersV2Json(ledger, settlement, seal);
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(parsed.attestationSignature, seal);
  assert.equal(parsed.paypalOrdersV2Payload.id, groupBuy.paypalOrderId);
  assert.equal(parsed.paypalOrdersV2Payload.intent, 'CAPTURE');
  assert.equal(parsed.paypalPayoutsBatchPayload.items.length, 2);
  assert.equal(parsed.proRataRefundBatchPayload.items.length, 6);

  const csvStr = exportEscrowLedgerCsv(ledger, settlement, seal);
  assert.ok(csvStr.includes('entry_id,account_type,participant_id'));
  assert.ok(csvStr.includes('CONTRIBUTOR_ESCROW_FUNDING'));
  assert.ok(csvStr.includes('PAYEE_MILESTONE_DISBURSEMENT'));
  assert.ok(csvStr.includes('CONTRIBUTOR_PRO_RATA_REFUND'));
  assert.ok(csvStr.includes('BALANCED_ZERO_DRIFT'));

  const mdStr = exportEscrowContractMarkdown(ledger, settlement, seal);
  assert.ok(
    mdStr.includes(
      '# SplitEscrow — PayPal Orders v2 & Multiparty Escrow Settlement Certificate'
    )
  );
  assert.ok(mdStr.includes(seal));
  assert.ok(mdStr.includes('TRUE (0 Cent Drift)'));
});

test('Gate 4: 4-Stage PayPal AI Agent Supervisor, 4.5s Circuit Breaker & FNV-1a-32 Attestation Seal', async () => {
  const normalPolicy = {
    fundedRatioBps: 10000,
    deliverableVerificationScore: 92,
    chargebackRiskScore: 12,
    disputeMode: 'NONE' as const,
    disputePayeeAwardBps: 6500,
  };

  const liveRun = await runPayPalAgentSupervisorPipeline({
    contractId: 'SPE-FREELANCE-FULLSTACK',
    rawEscrowNotes: 'Client email finance@acme.io · Phone (415) 890-2211',
    policy: normalPolicy,
  });

  assert.equal(liveRun.decisionMode, 'DECISION_PAYPAL_AGENT_LIVE');
  assert.equal(liveRun.circuitBreakerTripped, false);
  assert.equal(liveRun.stageTraces.length, 4);
  assert.equal(liveRun.scrubbedIntake.redactionCount, 2);
  assert.ok(liveRun.attestation.signature.startsWith('SPE-PPAL-'));
  assert.equal(liveRun.paypalMcpToolkitSpec.sdkPackage, '@paypal/agent-toolkit');
  assert.equal(liveRun.paypalMcpToolkitSpec.mcpToolCalls.length, 3);
  assert.ok(
    liveRun.paypalMcpToolkitSpec.headers['PayPal-Request-Id'].startsWith('ppal-idemp-')
  );

  const fallbackRun = await runPayPalAgentSupervisorPipeline({
    contractId: 'SPE-CROSSBORDER-DESIGN-SPRINT',
    rawEscrowNotes: 'Simulate sandbox timeout fallback',
    policy: normalPolicy,
    simulateTimeout: true,
  });

  assert.equal(fallbackRun.decisionMode, 'DECISION_LOCAL_SANDBOX_FALLBACK');
  assert.equal(fallbackRun.circuitBreakerTripped, true);
  assert.ok(fallbackRun.stageTraces.every((s) => s.status === 'FALLBACK_RECOVERED'));

  // Verify FNV-1a-32 attestation integrity & 1-cent / policy tamper invalidation
  const seal = createEscrowSettlementAttestation(
    liveRun.ledger,
    liveRun.settlement,
    normalPolicy
  );
  assert.equal(
    verifyEscrowAttestationIntegrity(seal, liveRun.ledger, liveRun.settlement, normalPolicy),
    true
  );

  // Mutating disputePayeeAwardBps or deliverableVerificationScore must invalidate the seal
  assert.equal(
    verifyEscrowAttestationIntegrity(seal, liveRun.ledger, liveRun.settlement, {
      ...normalPolicy,
      deliverableVerificationScore: 91,
    }),
    false
  );

  // Mutating a payee's disbursedCents by 1 cent must invalidate the seal
  const tamperedSettlement = {
    ...liveRun.settlement,
    payeeDisbursements: liveRun.settlement.payeeDisbursements.map((p, idx) =>
      idx === 0 ? { ...p, disbursedCents: p.disbursedCents + 1 } : p
    ),
  };
  assert.equal(
    verifyEscrowAttestationIntegrity(
      seal,
      liveRun.ledger,
      tamperedSettlement,
      normalPolicy
    ),
    false
  );
});

test('Gate 5: Port 5188 Strict Isolation & Interactive SplitEscrow Studio Wiring', () => {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')
  );
  assert.ok(
    pkgJson.scripts.dev.includes('--port 5188 --strictPort'),
    'package.json dev script must bind strictly to port 5188'
  );

  const viteCfg = fs.readFileSync(path.join(PROJECT_ROOT, 'vite.config.ts'), 'utf8');
  assert.ok(viteCfg.includes('port: 5188'));
  assert.ok(viteCfg.includes('strictPort: true'));

  const appTsx = fs.readFileSync(path.join(PROJECT_ROOT, 'src/App.tsx'), 'utf8');
  assert.ok(
    appTsx.includes('PayPal Orders v2 Multiparty Escrow &amp; Penny-Reconciliation Flow')
  );
  assert.ok(appTsx.includes('Seal Escrow Settlement (FNV-1a-32)'));
});

test('Gate 6: Clean-Room Audit (Zero Internal Terminology Leaks & Zero External CDNs)', () => {
  const filesToAudit = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'index.html',
    '.env.example',
    'README.md',
    'HANDOFF_2_0.md',
    'devpost/PRD.md',
    'devpost/ARCHITECTURE.md',
    'devpost/SUBMISSION_CHECKLIST.md',
    'src/main.tsx',
    'src/App.tsx',
    'src/styles.css',
    'src/lib/ledger/paypal-escrow-ledger.ts',
    'src/lib/solver/milestone-dispute-solver.ts',
    'src/lib/export/escrow-settlement-exporter.ts',
    'src/lib/paypal/paypal-agent-supervisor.ts',
    'src/test/splitescrow-verification.test.ts',
  ];

  const forbiddenTerms = [
    'Edi' + 'os',
    'Sove' + 'reign',
    '3+3 ' + 'Self-Play',
    'Prop' + 'oser',
    'Adver' + 'sary',
    'Cit' + 'adel',
    'Sanc' + 'tuary',
    'No' + 'va',
    'Lu' + 'na',
  ];

  for (const relPath of filesToAudit) {
    const absPath = path.join(PROJECT_ROOT, relPath);
    assert.equal(fs.existsSync(absPath), true, `Missing audited file: ${relPath}`);
    const content = fs.readFileSync(absPath, 'utf8');
    for (const term of forbiddenTerms) {
      assert.equal(
        content.toLowerCase().includes(term.toLowerCase()),
        false,
        `Clean-room violation: found forbidden term "${term}" in ${relPath}`
      );
    }
  }

  const indexHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
  assert.equal(
    indexHtml.includes('https://'),
    false,
    'index.html must not load external CDN scripts or fonts'
  );
});
