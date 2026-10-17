import {
  type EscrowLedgerBalance,
  formatUsdFromCents,
} from '../ledger/paypal-escrow-ledger.ts';
import type { EscrowSettlementDecision } from '../solver/milestone-dispute-solver.ts';

function formatDecimalUsd(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

export function exportPayPalOrdersV2Json(
  ledger: EscrowLedgerBalance,
  settlement: EscrowSettlementDecision,
  attestationSignature: string
): string {
  const payload = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'SplitEscrow PayPal Orders v2 & Multiparty Payouts Settlement Manifest',
    attestationSignature,
    contractSummary: {
      contractId: ledger.contractId,
      title: ledger.title,
      category: ledger.category,
      settlementStatus: settlement.settlementStatus,
      captureEligible: settlement.captureEligible,
      doubleEntryBalanced: ledger.doubleEntryBalanced && settlement.conservationBalanced,
      grossOrderCents: ledger.grossOrderCents,
      fundedPoolCents: settlement.fundedPoolCents,
      appliedPlatformFeeCents: settlement.appliedPlatformFeeCents,
      totalPayeeDisbursedCents: settlement.totalPayeeDisbursedCents,
      totalContributorRefundedCents: settlement.totalContributorRefundedCents,
      heldInEscrowCents: settlement.heldInEscrowCents,
      holdCodes: settlement.holdCodes,
    },
    paypalOrdersV2Payload: {
      id: ledger.paypalOrderId,
      intent: settlement.paypalOrderIntent,
      status: settlement.captureEligible ? 'COMPLETED' : 'PAYER_ACTION_REQUIRED',
      purchase_units: [
        {
          reference_id: ledger.contractId,
          description: ledger.title,
          custom_id: attestationSignature,
          amount: {
            currency_code: ledger.currencyCode,
            value: formatDecimalUsd(settlement.fundedPoolCents),
            breakdown: {
              item_total: {
                currency_code: ledger.currencyCode,
                value: formatDecimalUsd(
                  settlement.fundedPoolCents - settlement.appliedPlatformFeeCents
                ),
              },
              handling: {
                currency_code: ledger.currencyCode,
                value: formatDecimalUsd(settlement.appliedPlatformFeeCents),
              },
            },
          },
          payment_instruction: {
            disbursement_mode: 'DELAYED',
            platform_fees: [
              {
                amount: {
                  currency_code: ledger.currencyCode,
                  value: formatDecimalUsd(settlement.appliedPlatformFeeCents),
                },
              },
            ],
          },
        },
      ],
    },
    paypalPayoutsBatchPayload: {
      sender_batch_header: {
        sender_batch_id: `${attestationSignature}-PAYOUTS`,
        email_subject: `SplitEscrow Milestone Disbursement (${ledger.contractId})`,
        recipient_type: 'PAYPAL_ID',
      },
      items: settlement.payeeDisbursements.map((payee, index) => ({
        recipient_type: 'PAYPAL_ID',
        receiver: payee.paypalMerchantId,
        sender_item_id: `${ledger.contractId}-PAYEE-${index + 1}`,
        note: `${payee.role} (${(payee.shareBps / 100).toFixed(2)}% share)`,
        payout_status: payee.payoutStatus,
        amount: {
          currency: ledger.currencyCode,
          value: formatDecimalUsd(payee.disbursedCents),
        },
      })),
    },
    proRataRefundBatchPayload: {
      sender_batch_id: `${attestationSignature}-REFUNDS`,
      items: settlement.contributorRefunds.map((contrib, index) => ({
        contributor_id: contrib.contributorId,
        paypal_payer_id: contrib.paypalPayerId,
        refund_item_id: `${ledger.contractId}-REFUND-${index + 1}`,
        deposited_value: formatDecimalUsd(contrib.depositedCents),
        refund_value: formatDecimalUsd(contrib.refundedCents),
        currency_code: ledger.currencyCode,
      })),
    },
  };

  return JSON.stringify(payload, null, 2);
}

function escapeCsvCell(val: string | number): string {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportEscrowLedgerCsv(
  ledger: EscrowLedgerBalance,
  settlement: EscrowSettlementDecision,
  attestationSignature: string
): string {
  const headers = [
    'entry_id',
    'account_type',
    'participant_id',
    'participant_name',
    'paypal_account_id',
    'debit_cents',
    'credit_cents',
    'usd_formatted',
    'settlement_status',
    'attestation_seal',
  ];

  const rows: (string | number)[][] = [];
  let entrySeq = 1;

  // Debit entries: Contributor funding into Escrow Trust Account
  for (const deposit of ledger.contributorDeposits) {
    rows.push([
      `LEDGER-${String(entrySeq++).padStart(3, '0')}`,
      'CONTRIBUTOR_ESCROW_FUNDING',
      deposit.id,
      deposit.displayName,
      deposit.paypalPayerId,
      deposit.depositedCents,
      0,
      formatUsdFromCents(deposit.depositedCents),
      settlement.settlementStatus,
      attestationSignature,
    ]);
  }

  // Credit entry: Applied PayPal Platform Fee
  rows.push([
    `LEDGER-${String(entrySeq++).padStart(3, '0')}`,
    'PAYPAL_PLATFORM_FEE',
    'PAYPAL-MERCHANT-PLATFORM',
    'PayPal Multiparty Platform Fee',
    'PPAL-FEE-COLLECTOR',
    0,
    settlement.appliedPlatformFeeCents,
    formatUsdFromCents(settlement.appliedPlatformFeeCents),
    settlement.settlementStatus,
    attestationSignature,
  ]);

  // Credit entries: Payee Milestone Disbursements
  for (const payee of settlement.payeeDisbursements) {
    rows.push([
      `LEDGER-${String(entrySeq++).padStart(3, '0')}`,
      'PAYEE_MILESTONE_DISBURSEMENT',
      payee.payeeId,
      payee.displayName,
      payee.paypalMerchantId,
      0,
      payee.disbursedCents,
      formatUsdFromCents(payee.disbursedCents),
      payee.payoutStatus,
      attestationSignature,
    ]);
  }

  // Credit entries: Contributor Pro-Rata Refunds
  for (const refund of settlement.contributorRefunds) {
    rows.push([
      `LEDGER-${String(entrySeq++).padStart(3, '0')}`,
      'CONTRIBUTOR_PRO_RATA_REFUND',
      refund.contributorId,
      refund.displayName,
      refund.paypalPayerId,
      0,
      refund.refundedCents,
      formatUsdFromCents(refund.refundedCents),
      settlement.settlementStatus,
      attestationSignature,
    ]);
  }

  // Credit entry: Held in Escrow Reserve
  rows.push([
    `LEDGER-${String(entrySeq++).padStart(3, '0')}`,
    'ESCROW_RESERVE_HOLD',
    'ESCROW-VAULT-LOCK',
    'PayPal Delayed Disbursement Reserve Hold',
    ledger.paypalOrderId,
    0,
    settlement.heldInEscrowCents,
    formatUsdFromCents(settlement.heldInEscrowCents),
    settlement.settlementStatus,
    attestationSignature,
  ]);

  const totalDebitCents = ledger.fundedPoolCents;
  const totalCreditCents =
    settlement.appliedPlatformFeeCents +
    settlement.totalPayeeDisbursedCents +
    settlement.totalContributorRefundedCents +
    settlement.heldInEscrowCents;

  rows.push([
    `LEDGER-${String(entrySeq).padStart(3, '0')}`,
    'TOTAL_RECONCILIATION_BALANCE',
    ledger.contractId,
    'Double-Entry Trial Balance Check',
    ledger.paypalOrderId,
    totalDebitCents,
    totalCreditCents,
    formatUsdFromCents(totalCreditCents),
    totalDebitCents === totalCreditCents ? 'BALANCED_ZERO_DRIFT' : 'IMBALANCED_ERROR',
    attestationSignature,
  ]);

  return [headers.join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
}

export function exportEscrowContractMarkdown(
  ledger: EscrowLedgerBalance,
  settlement: EscrowSettlementDecision,
  attestationSignature: string
): string {
  const payeeLines = settlement.payeeDisbursements
    .map(
      (p) =>
        `| ${p.payeeId} | ${p.displayName} | \`${p.paypalMerchantId}\` | ${(p.shareBps / 100).toFixed(2)}% | ${formatUsdFromCents(p.disbursedCents)} | \`${p.payoutStatus}\` |`
    )
    .join('\n');

  const contributorLines = settlement.contributorRefunds
    .map(
      (c) =>
        `| ${c.contributorId} | ${c.displayName} | \`${c.paypalPayerId}\` | ${(c.shareBps / 100).toFixed(2)}% | ${formatUsdFromCents(c.depositedCents)} | ${formatUsdFromCents(c.refundedCents)} |`
    )
    .join('\n');

  const holdSection =
    settlement.holdDiagnostics.length === 0
      ? '- `NONE` — All milestone deliverable and funding covenants passed.'
      : settlement.holdDiagnostics
          .map((h) => `- **\`${h.holdCode}\`** (${h.severity}): ${h.summary} — *${h.remediationAction}*`)
          .join('\n');

  return [
    '# SplitEscrow — PayPal Orders v2 & Multiparty Escrow Settlement Certificate',
    '',
    `- **Contract ID**: \`${ledger.contractId}\``,
    `- **Contract Title**: ${ledger.title}`,
    `- **PayPal Order ID**: \`${ledger.paypalOrderId}\` (\`intent: ${settlement.paypalOrderIntent}\`)`,
    `- **Settlement Status**: \`${settlement.settlementStatus}\``,
    `- **Cryptographic Attestation Seal**: \`${attestationSignature}\``,
    '',
    '## 1. Double-Entry Conservation Summary (Integer USD Cents)',
    '',
    `- **Gross Contract Target**: ${formatUsdFromCents(ledger.grossOrderCents)} (\`${ledger.grossOrderCents}\` cents)`,
    `- **Funded Pool Balance**: ${formatUsdFromCents(settlement.fundedPoolCents)} (\`${settlement.fundedPoolCents}\` cents · \`${(ledger.fundedRatioBps / 100).toFixed(2)}%\` funded)`,
    `- **Applied PayPal Platform Fee**: ${formatUsdFromCents(settlement.appliedPlatformFeeCents)} (\`${settlement.appliedPlatformFeeCents}\` cents)`,
    `- **Total Payee Disbursements**: ${formatUsdFromCents(settlement.totalPayeeDisbursedCents)} (\`${settlement.totalPayeeDisbursedCents}\` cents)`,
    `- **Total Contributor Pro-Rata Refunds**: ${formatUsdFromCents(settlement.totalContributorRefundedCents)} (\`${settlement.totalContributorRefundedCents}\` cents)`,
    `- **Held in Escrow Reserve**: ${formatUsdFromCents(settlement.heldInEscrowCents)} (\`${settlement.heldInEscrowCents}\` cents)`,
    `- **Conservation Law Verified**: \`${settlement.conservationBalanced ? 'TRUE (0 Cent Drift)' : 'FALSE'}\``,
    '',
    '## 2. Active Escrow Hold & Covenant Diagnostics',
    '',
    holdSection,
    '',
    '## 3. Multiparty Payee Disbursement Schedule',
    '',
    '| Payee ID | Specialist / Vendor | PayPal Merchant ID | Share | Disbursed USD | Status |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    payeeLines,
    '',
    '## 4. Group-Buy Contributor Deposit & Pro-Rata Refund Ledger',
    '',
    '| Contributor ID | Participant Name | PayPal Payer ID | Share | Deposited USD | Refunded USD |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    contributorLines,
    '',
  ].join('\n');
}
