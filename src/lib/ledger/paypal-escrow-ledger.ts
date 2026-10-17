export type EscrowContractId =
  | 'SPE-FREELANCE-FULLSTACK'
  | 'SPE-GROUPBUY-H100-CLUSTER'
  | 'SPE-CREATOR-SPONSOR-SYNDICATE'
  | 'SPE-CROSSBORDER-DESIGN-SPRINT';

export type EscrowCategory =
  | 'FREELANCE_MILESTONE'
  | 'GROUP_BUY_SYNDICATE'
  | 'CREATOR_REVENUE_SPLIT'
  | 'CROSS_BORDER_SPRINT';

export interface EscrowContributorSpec {
  id: string;
  displayName: string;
  paypalPayerId: string;
  shareBps: number;
}

export interface EscrowPayeeSpec {
  id: string;
  displayName: string;
  paypalMerchantId: string;
  role: string;
  shareBps: number;
  milestoneLabel: string;
}

export interface EscrowMilestoneTrancheSpec {
  id: string;
  title: string;
  shareBps: number;
  verificationCriteria: string;
}

export interface EscrowContractTemplate {
  id: EscrowContractId;
  title: string;
  category: EscrowCategory;
  paypalOrderId: string;
  currencyCode: 'USD';
  grossOrderCents: number;
  platformFeeBps: number;
  minFundingThresholdBps: number;
  minDeliverableVerificationScore: number;
  maxChargebackRiskScore: number;
  defaultFundedRatioBps: number;
  defaultDeliverableScore: number;
  defaultChargebackRiskScore: number;
  contributors: readonly EscrowContributorSpec[];
  payees: readonly EscrowPayeeSpec[];
  milestones: readonly EscrowMilestoneTrancheSpec[];
}

export interface ReconciledShareAllocation {
  id: string;
  shareBps: number;
  floorCents: number;
  remainderNumerator: number;
  extraPennyAssigned: number;
  allocatedCents: number;
}

export interface ReconciledShareSummary {
  totalTargetCents: number;
  totalAllocatedCents: number;
  remainderPenniesDistributed: number;
  allocations: ReconciledShareAllocation[];
}

export interface ReconciledContributorDeposit {
  id: string;
  displayName: string;
  paypalPayerId: string;
  shareBps: number;
  depositedCents: number;
  extraPennyAssigned: number;
}

export interface ReconciledPayeeAllocation {
  id: string;
  displayName: string;
  paypalMerchantId: string;
  role: string;
  milestoneLabel: string;
  shareBps: number;
  targetNetCents: number;
  extraPennyAssigned: number;
}

export interface ReconciledMilestoneTranche {
  id: string;
  title: string;
  verificationCriteria: string;
  shareBps: number;
  trancheNetCents: number;
  extraPennyAssigned: number;
}

export interface EscrowLedgerBalance {
  contractId: EscrowContractId;
  title: string;
  category: EscrowCategory;
  paypalOrderId: string;
  currencyCode: 'USD';
  grossOrderCents: number;
  fundedRatioBps: number;
  fundedPoolCents: number;
  unfundedShortfallCents: number;
  platformFeeBps: number;
  paypalPlatformFeeCents: number;
  netEscrowPoolCents: number;
  contributorDeposits: ReconciledContributorDeposit[];
  payeeAllocations: ReconciledPayeeAllocation[];
  milestoneTranches: ReconciledMilestoneTranche[];
  contributorRemainderPennies: number;
  payeeRemainderPennies: number;
  milestoneRemainderPennies: number;
  doubleEntryBalanced: boolean;
}

export interface FinancialScrubResult {
  sanitizedText: string;
  redactionCount: number;
  redactedCategories: string[];
}

export const ESCROW_CONTRACT_TEMPLATES: readonly EscrowContractTemplate[] = [
  {
    id: 'SPE-FREELANCE-FULLSTACK',
    title: 'Freelance AI Checkout & Webhook Architecture Milestone Contract',
    category: 'FREELANCE_MILESTONE',
    paypalOrderId: 'ORD-PPAL-V2-8841-FRL',
    currencyCode: 'USD',
    grossOrderCents: 480000, // $4,800.00
    platformFeeBps: 250, // 2.50%
    minFundingThresholdBps: 10000,
    minDeliverableVerificationScore: 80,
    maxChargebackRiskScore: 35,
    defaultFundedRatioBps: 10000,
    defaultDeliverableScore: 92,
    defaultChargebackRiskScore: 12,
    contributors: [
      {
        id: 'BUYER-ACME-LABS',
        displayName: 'Acme Commerce Labs LLC',
        paypalPayerId: 'PAYER-ACME-9012',
        shareBps: 7000,
      },
      {
        id: 'BUYER-VENTURE-CO',
        displayName: 'Northstar Co-Invest Partner',
        paypalPayerId: 'PAYER-NSTAR-4410',
        shareBps: 3000,
      },
    ],
    payees: [
      {
        id: 'PAYEE-LEAD-ENG',
        displayName: 'Elena Rostova (Lead Systems Architect)',
        paypalMerchantId: 'MCHT-ROSTOVA-77A',
        role: 'Lead Checkout & Orders v2 Engineer',
        shareBps: 6250,
        milestoneLabel: 'M1+M2 Core Orders v2 & Webhook Engine',
      },
      {
        id: 'PAYEE-SEC-AUDITOR',
        displayName: 'Marcus Vance (PCI & QA Specialist)',
        paypalMerchantId: 'MCHT-VANCE-19B',
        role: 'Security & Settlement Auditor',
        shareBps: 3750,
        milestoneLabel: 'M3 Idempotency & Stress Verification',
      },
    ],
    milestones: [
      {
        id: 'MS-01-AUTH-SCHEMA',
        title: 'Tranche 1: PayPal Orders v2 AUTHORIZE & Intent Locking',
        shareBps: 3500,
        verificationCriteria: 'Signed webhook schema + 100% unit test coverage on AUTHORIZE state.',
      },
      {
        id: 'MS-02-MULTIPARTY-SPLIT',
        title: 'Tranche 2: Multiparty Payouts & Largest-Remainder Reconciler',
        shareBps: 4000,
        verificationCriteria: 'Zero cent drift across uneven contributor and payee basis points.',
      },
      {
        id: 'MS-03-DISPUTE-GUARD',
        title: 'Tranche 3: Dispute Arbitration & Pro-Rata Refund Engine',
        shareBps: 2500,
        verificationCriteria: 'Automated pro-rata refund ledger verified in PayPal Sandbox.',
      },
    ],
  },
  {
    id: 'SPE-GROUPBUY-H100-CLUSTER',
    title: '6-Lab Shared AI Compute Node Group-Purchase Pool',
    category: 'GROUP_BUY_SYNDICATE',
    paypalOrderId: 'ORD-PPAL-V2-9920-GRP',
    currencyCode: 'USD',
    grossOrderCents: 1000000, // $10,000.00
    platformFeeBps: 200, // 2.00%
    minFundingThresholdBps: 10000,
    minDeliverableVerificationScore: 85,
    maxChargebackRiskScore: 30,
    defaultFundedRatioBps: 10000,
    defaultDeliverableScore: 90,
    defaultChargebackRiskScore: 15,
    contributors: [
      {
        id: 'CONTRIB-LAB-ALPHA',
        displayName: 'Alpha Robotics Collective',
        paypalPayerId: 'PAYER-ALPHA-101',
        shareBps: 2333,
      },
      {
        id: 'CONTRIB-LAB-BETA',
        displayName: 'Beta BioCompute Studio',
        paypalPayerId: 'PAYER-BETA-102',
        shareBps: 2111,
      },
      {
        id: 'CONTRIB-LAB-GAMMA',
        displayName: 'Gamma Synthesis Group',
        paypalPayerId: 'PAYER-GAMMA-103',
        shareBps: 1777,
      },
      {
        id: 'CONTRIB-LAB-DELTA',
        displayName: 'Delta Vision Foundry',
        paypalPayerId: 'PAYER-DELTA-104',
        shareBps: 1556,
      },
      {
        id: 'CONTRIB-LAB-EPSILON',
        displayName: 'Epsilon Acoustic Lab',
        paypalPayerId: 'PAYER-EPSILON-105',
        shareBps: 1223,
      },
      {
        id: 'CONTRIB-LAB-ZETA',
        displayName: 'Zeta Edge Inference Guild',
        paypalPayerId: 'PAYER-ZETA-106',
        shareBps: 1000,
      },
    ],
    payees: [
      {
        id: 'PAYEE-OEM-HARDWARE',
        displayName: 'SiliconRack Direct OEM Inc.',
        paypalMerchantId: 'MCHT-SILICONRACK-01',
        role: 'Primary Server Chassis & GPU Supplier',
        shareBps: 8200,
        milestoneLabel: 'Factory Burn-In & Serial Manifest Verification',
      },
      {
        id: 'PAYEE-COLO-DATACENTER',
        displayName: 'EquiCore Tier-4 Colocation Facility',
        paypalMerchantId: 'MCHT-EQUICORE-02',
        role: 'Rack Provisioning & 100GbE Uplinks',
        shareBps: 1800,
        milestoneLabel: 'Rack Energization & WireGuard Peering Proof',
      },
    ],
    milestones: [
      {
        id: 'MS-01-POOL-LOCK',
        title: 'Tranche 1: 6-Member Group Pool Escrow Lock & BOM Serial Match',
        shareBps: 5000,
        verificationCriteria: 'All 6 contributor deposits cleared + OEM serial numbers attested.',
      },
      {
        id: 'MS-02-FREIGHT-DELIVERY',
        title: 'Tranche 2: Insured Freight & Datacenter Intake Receipt',
        shareBps: 3200,
        verificationCriteria: 'Signed dock receipt + shock-sensor telemetry within threshold.',
      },
      {
        id: 'MS-03-BURN-IN-PASS',
        title: 'Tranche 3: 24-Hour Cluster Stress Benchmark & SSH Handover',
        shareBps: 1800,
        verificationCriteria: 'Zero ECC memory errors over 24h burn-in benchmark.',
      },
    ],
  },
  {
    id: 'SPE-CREATOR-SPONSOR-SYNDICATE',
    title: '3-Way Creator Brand Sponsorship & Post-Production Syndicate ($3,333.33 Odd-Penny Split)',
    category: 'CREATOR_REVENUE_SPLIT',
    paypalOrderId: 'ORD-PPAL-V2-3333-SYN',
    currencyCode: 'USD',
    grossOrderCents: 333333, // $3,333.33 — specifically tests 3-way odd-penny reconciliation
    platformFeeBps: 0, // Zero platform fee to test pure $3,333.33 -> $1,111.11 / $1,111.11 / $1,111.11 split
    minFundingThresholdBps: 10000,
    minDeliverableVerificationScore: 78,
    maxChargebackRiskScore: 40,
    defaultFundedRatioBps: 10000,
    defaultDeliverableScore: 88,
    defaultChargebackRiskScore: 10,
    contributors: [
      {
        id: 'BUYER-AURORA-AUDIO',
        displayName: 'Aurora Studio Monitors Corp.',
        paypalPayerId: 'PAYER-AURORA-880',
        shareBps: 10000,
      },
    ],
    payees: [
      {
        id: 'PAYEE-HOST-CREATOR',
        displayName: 'Devon Brooks (Channel Host)',
        paypalMerchantId: 'MCHT-BROOKS-331',
        role: 'On-Camera Technical Review Host',
        shareBps: 3334,
        milestoneLabel: 'Primary Video Segment & Sponsor Read',
      },
      {
        id: 'PAYEE-VFX-EDITOR',
        displayName: 'Sora Takahashi (Lead Motion & Colorist)',
        paypalMerchantId: 'MCHT-TAKAHASHI-332',
        role: '4K Mastering & Acoustic Charts',
        shareBps: 3333,
        milestoneLabel: 'Final 4K ProRes Delivery & Captions',
      },
      {
        id: 'PAYEE-SOUND-ENG',
        displayName: 'Liam O-Connor (Binaural Mix Engineer)',
        paypalMerchantId: 'MCHT-OCONNOR-333',
        role: 'Acoustic Measurement & Mastering',
        shareBps: 3333,
        milestoneLabel: 'LUFS-14 Audio Master & Stems',
      },
    ],
    milestones: [
      {
        id: 'MS-01-SCRIPT-APPROVAL',
        title: 'Tranche 1: Sponsor Fact-Check & FTC Disclosure Verification',
        shareBps: 3334,
        verificationCriteria: 'FTC #ad disclosure verified in first 15 seconds + technical spec check.',
      },
      {
        id: 'MS-02-ROUGH-CUT',
        title: 'Tranche 2: Frame.io Rough Cut & Audio Stem Approval',
        shareBps: 3333,
        verificationCriteria: 'Sponsor timecode sign-off on integration segment.',
      },
      {
        id: 'MS-03-PUBLIC-RELEASE',
        title: 'Tranche 3: Live Broadcast Link & 48-Hour Retention Check',
        shareBps: 3333,
        verificationCriteria: 'Live video URL verified with pinned checkout link.',
      },
    ],
  },
  {
    id: 'SPE-CROSSBORDER-DESIGN-SPRINT',
    title: 'Cross-Border Industrial Enclosure CAD & CNC Prototyping Escrow',
    category: 'CROSS_BORDER_SPRINT',
    paypalOrderId: 'ORD-PPAL-V2-6250-XBD',
    currencyCode: 'USD',
    grossOrderCents: 625000, // $6,250.00
    platformFeeBps: 300, // 3.00%
    minFundingThresholdBps: 10000,
    minDeliverableVerificationScore: 82,
    maxChargebackRiskScore: 30,
    defaultFundedRatioBps: 7600, // Underfunded by default to demonstrate Group Pool hold until topped up
    defaultDeliverableScore: 68, // Incomplete CAD tolerances by default to demonstrate Deliverable Hold
    defaultChargebackRiskScore: 48, // Elevated risk score by default to demonstrate Chargeback Freeze
    contributors: [
      {
        id: 'BUYER-NORDIC-HW',
        displayName: 'Nordic Precision Instruments AB',
        paypalPayerId: 'PAYER-NORDIC-501',
        shareBps: 5500,
      },
      {
        id: 'BUYER-PACIFIC-DIST',
        displayName: 'Pacific Rim Hardware Syndicate',
        paypalPayerId: 'PAYER-PACRIM-502',
        shareBps: 4500,
      },
    ],
    payees: [
      {
        id: 'PAYEE-CAD-STUDIO',
        displayName: 'Atelier Forme Industrielle',
        paypalMerchantId: 'MCHT-FORME-601',
        role: 'STEP/IGES Surface Modeling & DFM',
        shareBps: 5800,
        milestoneLabel: 'DFM Tolerance Analysis & Mold Flow',
      },
      {
        id: 'PAYEE-CNC-TOOLING',
        displayName: 'Apex 5-Axis Prototyping Ltd.',
        paypalMerchantId: 'MCHT-APEXCNC-602',
        role: '6061-T6 Aluminum First-Article Machining',
        shareBps: 4200,
        milestoneLabel: 'CMM Metrology Report & Anodized Sample',
      },
    ],
    milestones: [
      {
        id: 'MS-01-STEP-FREEZE',
        title: 'Tranche 1: Parametric STEP File Freeze & Draft Angle Audit',
        shareBps: 4000,
        verificationCriteria: 'Zero undercut violations in DFM geometry solver.',
      },
      {
        id: 'MS-02-CNC-FIRST-ARTICLE',
        title: 'Tranche 2: 5-Axis CNC First-Article CMM Inspection',
        shareBps: 6000,
        verificationCriteria: 'All critical dimensions within +/- 0.02mm CMM tolerance.',
      },
    ],
  },
];

export function getEscrowContractById(contractId: EscrowContractId): EscrowContractTemplate {
  const found = ESCROW_CONTRACT_TEMPLATES.find((c) => c.id === contractId);
  if (!found) {
    throw new Error(`Unknown EscrowContractId: ${contractId}`);
  }
  return found;
}

export function formatUsdFromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(Math.round(cents));
  const dollars = Math.floor(absCents / 100);
  const remCents = absCents % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(remCents).padStart(2, '0')}`;
}

/**
 * Deterministic Hamilton Largest-Remainder Method for splitting integer cents across basis-point shares.
 * Guarantees sum(allocatedCents) === totalTargetCents with zero floating-point drift.
 */
export function reconcileBasisPointSharesCents(
  totalTargetCents: number,
  shares: readonly { id: string; shareBps: number }[]
): ReconciledShareSummary {
  const safeTargetCents = Math.max(0, Math.round(totalTargetCents));
  const totalBps = shares.reduce((acc, item) => acc + item.shareBps, 0);
  if (totalBps !== 10000) {
    throw new Error(`Basis point shares must sum to 10000 bps, received ${totalBps}`);
  }

  const working = shares.map((item, index) => {
    const exactNumerator = safeTargetCents * item.shareBps;
    const floorCents = Math.floor(exactNumerator / 10000);
    const remainderNumerator = exactNumerator % 10000;
    return {
      index,
      id: item.id,
      shareBps: item.shareBps,
      floorCents,
      remainderNumerator,
      extraPennyAssigned: 0,
      allocatedCents: floorCents,
    };
  });

  const sumFloorCents = working.reduce((acc, item) => acc + item.floorCents, 0);
  const remainderPenniesDistributed = safeTargetCents - sumFloorCents;

  // Sort by largest fractional remainder descending; tie-break by higher shareBps then original index ascending
  const rankedByRemainder = [...working].sort((a, b) => {
    if (b.remainderNumerator !== a.remainderNumerator) {
      return b.remainderNumerator - a.remainderNumerator;
    }
    if (b.shareBps !== a.shareBps) {
      return b.shareBps - a.shareBps;
    }
    return a.index - b.index;
  });

  for (let i = 0; i < remainderPenniesDistributed; i += 1) {
    const winner = rankedByRemainder[i];
    if (winner) {
      winner.extraPennyAssigned = 1;
      winner.allocatedCents = winner.floorCents + 1;
    }
  }

  const allocations: ReconciledShareAllocation[] = working.map((item) => ({
    id: item.id,
    shareBps: item.shareBps,
    floorCents: item.floorCents,
    remainderNumerator: item.remainderNumerator,
    extraPennyAssigned: item.extraPennyAssigned,
    allocatedCents: item.allocatedCents,
  }));

  const totalAllocatedCents = allocations.reduce((acc, item) => acc + item.allocatedCents, 0);

  return {
    totalTargetCents: safeTargetCents,
    totalAllocatedCents,
    remainderPenniesDistributed,
    allocations,
  };
}

export function computeEscrowLedgerBalance(
  contract: EscrowContractTemplate,
  fundedRatioBpsInput?: number
): EscrowLedgerBalance {
  const fundedRatioBps = Math.max(
    0,
    Math.min(10000, Math.round(fundedRatioBpsInput ?? contract.defaultFundedRatioBps))
  );

  const fundedPoolCents = Math.round((contract.grossOrderCents * fundedRatioBps) / 10000);
  const unfundedShortfallCents = Math.max(0, contract.grossOrderCents - fundedPoolCents);
  const paypalPlatformFeeCents = Math.round((fundedPoolCents * contract.platformFeeBps) / 10000);
  const netEscrowPoolCents = fundedPoolCents - paypalPlatformFeeCents;

  const contributorSummary = reconcileBasisPointSharesCents(
    fundedPoolCents,
    contract.contributors.map((c) => ({ id: c.id, shareBps: c.shareBps }))
  );

  const payeeSummary = reconcileBasisPointSharesCents(
    netEscrowPoolCents,
    contract.payees.map((p) => ({ id: p.id, shareBps: p.shareBps }))
  );

  const milestoneSummary = reconcileBasisPointSharesCents(
    netEscrowPoolCents,
    contract.milestones.map((m) => ({ id: m.id, shareBps: m.shareBps }))
  );

  const contributorDeposits: ReconciledContributorDeposit[] = contract.contributors.map((c, idx) => {
    const alloc = contributorSummary.allocations[idx];
    return {
      id: c.id,
      displayName: c.displayName,
      paypalPayerId: c.paypalPayerId,
      shareBps: c.shareBps,
      depositedCents: alloc ? alloc.allocatedCents : 0,
      extraPennyAssigned: alloc ? alloc.extraPennyAssigned : 0,
    };
  });

  const payeeAllocations: ReconciledPayeeAllocation[] = contract.payees.map((p, idx) => {
    const alloc = payeeSummary.allocations[idx];
    return {
      id: p.id,
      displayName: p.displayName,
      paypalMerchantId: p.paypalMerchantId,
      role: p.role,
      milestoneLabel: p.milestoneLabel,
      shareBps: p.shareBps,
      targetNetCents: alloc ? alloc.allocatedCents : 0,
      extraPennyAssigned: alloc ? alloc.extraPennyAssigned : 0,
    };
  });

  const milestoneTranches: ReconciledMilestoneTranche[] = contract.milestones.map((m, idx) => {
    const alloc = milestoneSummary.allocations[idx];
    return {
      id: m.id,
      title: m.title,
      verificationCriteria: m.verificationCriteria,
      shareBps: m.shareBps,
      trancheNetCents: alloc ? alloc.allocatedCents : 0,
      extraPennyAssigned: alloc ? alloc.extraPennyAssigned : 0,
    };
  });

  const sumContributors = contributorDeposits.reduce((acc, c) => acc + c.depositedCents, 0);
  const sumPayees = payeeAllocations.reduce((acc, p) => acc + p.targetNetCents, 0);
  const sumMilestones = milestoneTranches.reduce((acc, m) => acc + m.trancheNetCents, 0);

  const doubleEntryBalanced =
    sumContributors === fundedPoolCents &&
    sumPayees === netEscrowPoolCents &&
    sumMilestones === netEscrowPoolCents &&
    netEscrowPoolCents + paypalPlatformFeeCents === fundedPoolCents;

  return {
    contractId: contract.id,
    title: contract.title,
    category: contract.category,
    paypalOrderId: contract.paypalOrderId,
    currencyCode: contract.currencyCode,
    grossOrderCents: contract.grossOrderCents,
    fundedRatioBps,
    fundedPoolCents,
    unfundedShortfallCents,
    platformFeeBps: contract.platformFeeBps,
    paypalPlatformFeeCents,
    netEscrowPoolCents,
    contributorDeposits,
    payeeAllocations,
    milestoneTranches,
    contributorRemainderPennies: contributorSummary.remainderPenniesDistributed,
    payeeRemainderPennies: payeeSummary.remainderPenniesDistributed,
    milestoneRemainderPennies: milestoneSummary.remainderPenniesDistributed,
    doubleEntryBalanced,
  };
}

const PAYPAL_BEARER_REGEX = /Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const PCI_PAN_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
const PCI_CVV_REGEX = /\b(?:CVV|CVC|CSC)\s*[:=]?\s*\d{3,4}\b/gi;
const BANK_ROUTING_REGEX = /\b(?:ABA|ROUTING|IBAN)\s*[:=]?\s*[A-Z0-9]{8,34}\b/gi;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

export function scrubFinancialNotesPii(rawNotes: string): FinancialScrubResult {
  let sanitizedText = rawNotes;
  let redactionCount = 0;
  const redactedCategories: string[] = [];

  const applyRule = (regex: RegExp, token: string, category: string) => {
    const matches = sanitizedText.match(regex);
    if (matches && matches.length > 0) {
      redactionCount += matches.length;
      if (!redactedCategories.includes(category)) {
        redactedCategories.push(category);
      }
      sanitizedText = sanitizedText.replace(regex, token);
    }
  };

  applyRule(PAYPAL_BEARER_REGEX, '[REDACTED_PAYPAL_BEARER_TOKEN]', 'PAYPAL_BEARER_TOKEN');
  applyRule(PCI_CVV_REGEX, '[REDACTED_PCI_CVV]', 'PCI_CVV');
  applyRule(BANK_ROUTING_REGEX, '[REDACTED_BANK_ROUTING]', 'BANK_ROUTING');
  applyRule(PCI_PAN_REGEX, '[REDACTED_PCI_PAN]', 'PCI_PAN');
  applyRule(EMAIL_REGEX, '[REDACTED_EMAIL]', 'EMAIL');
  applyRule(PHONE_REGEX, '[REDACTED_PHONE]', 'PHONE');

  return {
    sanitizedText,
    redactionCount,
    redactedCategories,
  };
}

export function verifyZeroFinancialLeakage(text: string): boolean {
  const checkRegexes = [
    new RegExp(PAYPAL_BEARER_REGEX.source, 'i'),
    new RegExp(PCI_CVV_REGEX.source, 'i'),
    new RegExp(BANK_ROUTING_REGEX.source, 'i'),
    new RegExp(PCI_PAN_REGEX.source),
    new RegExp(EMAIL_REGEX.source),
    new RegExp(PHONE_REGEX.source),
  ];
  return checkRegexes.every((rx) => !rx.test(text));
}
