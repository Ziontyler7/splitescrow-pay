import {
  type EscrowContractId,
  type EscrowContractTemplate,
  type EscrowLedgerBalance,
  reconcileBasisPointSharesCents,
} from '../ledger/paypal-escrow-ledger.ts';

export type EscrowHoldCode =
  | 'HOLD_GROUP_POOL_UNDERFUNDED'
  | 'HOLD_DELIVERABLE_INCOMPLETE'
  | 'HOLD_CHARGEBACK_RISK_FREEZE'
  | 'HOLD_DISPUTE_ARBITRATION_ACTIVE';

export type EscrowSettlementStatus =
  | 'CAPTURED_DISBURSED'
  | 'DISPUTE_PRO_RATA_SETTLED'
  | 'ESCROW_LOCKED_HOLD'
  | 'POOL_UNDERFUNDED_REFUND_READY';

export type DisputeArbitrationMode = 'NONE' | 'ARBITRATION_SPLIT' | 'FULL_BUYER_REFUND';

export interface EscrowPolicyInput {
  fundedRatioBps: number;
  deliverableVerificationScore: number;
  chargebackRiskScore: number;
  disputeMode: DisputeArbitrationMode;
  disputePayeeAwardBps: number;
}

export interface HoldDiagnosticEntry {
  holdCode: EscrowHoldCode;
  severity: 'CRITICAL_FREEZE' | 'COVENANT_HOLD' | 'ARBITRATION_SETTLEMENT';
  summary: string;
  remediationAction: string;
}

export interface PayeeDisbursementLine {
  payeeId: string;
  displayName: string;
  paypalMerchantId: string;
  role: string;
  shareBps: number;
  disbursedCents: number;
  extraPennyAssigned: number;
  payoutStatus: 'READY_FOR_PAYOUT' | 'HELD_IN_ESCROW' | 'ZEROED_BY_REFUND';
}

export interface ContributorRefundLine {
  contributorId: string;
  displayName: string;
  paypalPayerId: string;
  shareBps: number;
  depositedCents: number;
  refundedCents: number;
  extraPennyAssigned: number;
}

export interface EscrowSettlementDecision {
  contractId: EscrowContractId;
  paypalOrderId: string;
  settlementStatus: EscrowSettlementStatus;
  captureEligible: boolean;
  paypalOrderIntent: 'CAPTURE' | 'AUTHORIZE';
  fundedPoolCents: number;
  appliedPlatformFeeCents: number;
  totalPayeeDisbursedCents: number;
  totalContributorRefundedCents: number;
  heldInEscrowCents: number;
  holdCodes: EscrowHoldCode[];
  holdDiagnostics: HoldDiagnosticEntry[];
  payeeDisbursements: PayeeDisbursementLine[];
  contributorRefunds: ContributorRefundLine[];
  conservationBalanced: boolean;
}

export interface EscrowConservationAudit {
  valid: boolean;
  conservationDeltaCents: number;
  violations: string[];
}

export function solveMilestoneAndDisputeSettlement(
  contract: EscrowContractTemplate,
  ledger: EscrowLedgerBalance,
  policy: EscrowPolicyInput
): EscrowSettlementDecision {
  const holdCodes: EscrowHoldCode[] = [];
  const holdDiagnostics: HoldDiagnosticEntry[] = [];

  const fundedRatioBps = Math.max(0, Math.min(10000, Math.round(policy.fundedRatioBps)));
  const deliverableScore = Math.max(
    0,
    Math.min(100, Math.round(policy.deliverableVerificationScore))
  );
  const chargebackRisk = Math.max(0, Math.min(100, Math.round(policy.chargebackRiskScore)));
  const disputeAwardBps = Math.max(0, Math.min(10000, Math.round(policy.disputePayeeAwardBps)));

  const isChargebackFrozen = chargebackRisk > contract.maxChargebackRiskScore;
  const isUnderfunded = fundedRatioBps < contract.minFundingThresholdBps;
  const isDeliverableIncomplete = deliverableScore < contract.minDeliverableVerificationScore;

  if (isChargebackFrozen) {
    holdCodes.push('HOLD_CHARGEBACK_RISK_FREEZE');
    holdDiagnostics.push({
      holdCode: 'HOLD_CHARGEBACK_RISK_FREEZE',
      severity: 'CRITICAL_FREEZE',
      summary: `Chargeback risk index (${chargebackRisk}/100) exceeds contract ceiling (${contract.maxChargebackRiskScore}/100).`,
      remediationAction:
        'Freeze PayPal Orders v2 CAPTURE & Payouts batch until 3-D Secure / Seller Protection proof clears.',
    });
  }

  if (isUnderfunded) {
    holdCodes.push('HOLD_GROUP_POOL_UNDERFUNDED');
    holdDiagnostics.push({
      holdCode: 'HOLD_GROUP_POOL_UNDERFUNDED',
      severity: 'COVENANT_HOLD',
      summary: `Group pool funding (${(fundedRatioBps / 100).toFixed(2)}%) is below minimum lock threshold (${(contract.minFundingThresholdBps / 100).toFixed(2)}%).`,
      remediationAction:
        'Await remaining contributor AUTHORIZE captures or execute 100% pro-rata contributor refund.',
    });
  }

  if (isDeliverableIncomplete) {
    holdCodes.push('HOLD_DELIVERABLE_INCOMPLETE');
    holdDiagnostics.push({
      holdCode: 'HOLD_DELIVERABLE_INCOMPLETE',
      severity: 'COVENANT_HOLD',
      summary: `AI deliverable verification score (${deliverableScore}/100) is below milestone requirement (${contract.minDeliverableVerificationScore}/100).`,
      remediationAction:
        'Keep funds locked in PayPal AUTHORIZE hold until milestone acceptance criteria pass.',
    });
  }

  if (policy.disputeMode !== 'NONE') {
    holdCodes.push('HOLD_DISPUTE_ARBITRATION_ACTIVE');
    holdDiagnostics.push({
      holdCode: 'HOLD_DISPUTE_ARBITRATION_ACTIVE',
      severity: 'ARBITRATION_SETTLEMENT',
      summary:
        policy.disputeMode === 'FULL_BUYER_REFUND'
          ? 'Full buyer refund directive active: returning 100% of funded pool pro-rata to contributors.'
          : `Dispute arbitration split active: awarding ${(disputeAwardBps / 100).toFixed(2)}% to payees and refunding ${((10000 - disputeAwardBps) / 100).toFixed(2)}% pro-rata to contributors.`,
      remediationAction:
        'Execute Hamilton largest-remainder pro-rata settlement across payees and contributors.',
    });
  }

  let settlementStatus: EscrowSettlementStatus = 'CAPTURED_DISBURSED';
  let captureEligible = false;
  let paypalOrderIntent: 'CAPTURE' | 'AUTHORIZE' = 'AUTHORIZE';
  let appliedPlatformFeeCents = 0;
  let payeeTargetPoolCents = 0;
  let contributorRefundPoolCents = 0;
  let heldInEscrowCents = 0;

  if (isChargebackFrozen) {
    // Hard risk freeze: 100% of funded pool stays frozen in escrow
    settlementStatus = 'ESCROW_LOCKED_HOLD';
    captureEligible = false;
    paypalOrderIntent = 'AUTHORIZE';
    appliedPlatformFeeCents = 0;
    payeeTargetPoolCents = 0;
    contributorRefundPoolCents = 0;
    heldInEscrowCents = ledger.fundedPoolCents;
  } else if (policy.disputeMode === 'FULL_BUYER_REFUND') {
    // Full pro-rata refund of 100% of funded pool back to contributors (zero fee charged)
    settlementStatus = 'POOL_UNDERFUNDED_REFUND_READY';
    captureEligible = false;
    paypalOrderIntent = 'AUTHORIZE';
    appliedPlatformFeeCents = 0;
    payeeTargetPoolCents = 0;
    contributorRefundPoolCents = ledger.fundedPoolCents;
    heldInEscrowCents = 0;
  } else if (isUnderfunded) {
    // Pool is underfunded: hold 100% in escrow awaiting remaining contributor deposits
    settlementStatus = 'ESCROW_LOCKED_HOLD';
    captureEligible = false;
    paypalOrderIntent = 'AUTHORIZE';
    appliedPlatformFeeCents = 0;
    payeeTargetPoolCents = 0;
    contributorRefundPoolCents = 0;
    heldInEscrowCents = ledger.fundedPoolCents;
  } else if (policy.disputeMode === 'ARBITRATION_SPLIT') {
    // Funded pool meets threshold and enters arbitrated split settlement
    settlementStatus = 'DISPUTE_PRO_RATA_SETTLED';
    captureEligible = true;
    paypalOrderIntent = 'CAPTURE';
    appliedPlatformFeeCents = ledger.paypalPlatformFeeCents;
    payeeTargetPoolCents = Math.round((ledger.netEscrowPoolCents * disputeAwardBps) / 10000);
    contributorRefundPoolCents = ledger.netEscrowPoolCents - payeeTargetPoolCents;
    heldInEscrowCents = 0;
  } else if (isDeliverableIncomplete) {
    // Deliverable verification score below threshold: keep 100% locked in escrow
    settlementStatus = 'ESCROW_LOCKED_HOLD';
    captureEligible = false;
    paypalOrderIntent = 'AUTHORIZE';
    appliedPlatformFeeCents = 0;
    payeeTargetPoolCents = 0;
    contributorRefundPoolCents = 0;
    heldInEscrowCents = ledger.fundedPoolCents;
  } else {
    // All covenants verified: release 100% of net escrow pool to payees
    settlementStatus = 'CAPTURED_DISBURSED';
    captureEligible = true;
    paypalOrderIntent = 'CAPTURE';
    appliedPlatformFeeCents = ledger.paypalPlatformFeeCents;
    payeeTargetPoolCents = ledger.netEscrowPoolCents;
    contributorRefundPoolCents = 0;
    heldInEscrowCents = 0;
  }

  const payeeReconciled = reconcileBasisPointSharesCents(
    payeeTargetPoolCents,
    contract.payees.map((p) => ({ id: p.id, shareBps: p.shareBps }))
  );

  const contributorReconciled = reconcileBasisPointSharesCents(
    contributorRefundPoolCents,
    contract.contributors.map((c) => ({ id: c.id, shareBps: c.shareBps }))
  );

  const payeeDisbursements: PayeeDisbursementLine[] = contract.payees.map((p, idx) => {
    const alloc = payeeReconciled.allocations[idx];
    const disbursedCents = alloc ? alloc.allocatedCents : 0;
    let payoutStatus: PayeeDisbursementLine['payoutStatus'] = 'HELD_IN_ESCROW';
    if (captureEligible && disbursedCents > 0) {
      payoutStatus = 'READY_FOR_PAYOUT';
    } else if (contributorRefundPoolCents === ledger.fundedPoolCents) {
      payoutStatus = 'ZEROED_BY_REFUND';
    }
    return {
      payeeId: p.id,
      displayName: p.displayName,
      paypalMerchantId: p.paypalMerchantId,
      role: p.role,
      shareBps: p.shareBps,
      disbursedCents,
      extraPennyAssigned: alloc ? alloc.extraPennyAssigned : 0,
      payoutStatus,
    };
  });

  const contributorRefunds: ContributorRefundLine[] = contract.contributors.map((c, idx) => {
    const alloc = contributorReconciled.allocations[idx];
    const depositEntry = ledger.contributorDeposits[idx];
    return {
      contributorId: c.id,
      displayName: c.displayName,
      paypalPayerId: c.paypalPayerId,
      shareBps: c.shareBps,
      depositedCents: depositEntry ? depositEntry.depositedCents : 0,
      refundedCents: alloc ? alloc.allocatedCents : 0,
      extraPennyAssigned: alloc ? alloc.extraPennyAssigned : 0,
    };
  });

  const totalPayeeDisbursedCents = payeeDisbursements.reduce(
    (acc, item) => acc + item.disbursedCents,
    0
  );
  const totalContributorRefundedCents = contributorRefunds.reduce(
    (acc, item) => acc + item.refundedCents,
    0
  );

  const conservationBalanced =
    totalPayeeDisbursedCents +
      totalContributorRefundedCents +
      heldInEscrowCents +
      appliedPlatformFeeCents ===
    ledger.fundedPoolCents;

  return {
    contractId: contract.id,
    paypalOrderId: contract.paypalOrderId,
    settlementStatus,
    captureEligible,
    paypalOrderIntent,
    fundedPoolCents: ledger.fundedPoolCents,
    appliedPlatformFeeCents,
    totalPayeeDisbursedCents,
    totalContributorRefundedCents,
    heldInEscrowCents,
    holdCodes,
    holdDiagnostics,
    payeeDisbursements,
    contributorRefunds,
    conservationBalanced,
  };
}

export function verifyEscrowConservationLaw(
  settlement: EscrowSettlementDecision,
  contract: EscrowContractTemplate,
  policy: EscrowPolicyInput
): EscrowConservationAudit {
  const violations: string[] = [];

  const accountedCents =
    settlement.totalPayeeDisbursedCents +
    settlement.totalContributorRefundedCents +
    settlement.heldInEscrowCents +
    settlement.appliedPlatformFeeCents;

  const conservationDeltaCents = accountedCents - settlement.fundedPoolCents;
  if (conservationDeltaCents !== 0) {
    violations.push(
      `Conservation violation: accounted cents (${accountedCents}) !== fundedPoolCents (${settlement.fundedPoolCents})`
    );
  }

  if (
    policy.chargebackRiskScore > contract.maxChargebackRiskScore &&
    (settlement.totalPayeeDisbursedCents > 0 || settlement.captureEligible)
  ) {
    violations.push(
      'Chargeback freeze violation: funds were marked eligible or disbursed while chargeback risk exceeded threshold'
    );
  }

  if (
    policy.fundedRatioBps < contract.minFundingThresholdBps &&
    settlement.totalPayeeDisbursedCents > 0
  ) {
    violations.push(
      'Underfunded pool violation: payees received disbursement before minimum group-buy pool threshold was reached'
    );
  }

  if (
    policy.disputeMode === 'NONE' &&
    policy.deliverableVerificationScore < contract.minDeliverableVerificationScore &&
    settlement.totalPayeeDisbursedCents > 0
  ) {
    violations.push(
      'Deliverable verification violation: funds disbursed while deliverable score was below contract minimum'
    );
  }

  return {
    valid: violations.length === 0,
    conservationDeltaCents,
    violations,
  };
}
