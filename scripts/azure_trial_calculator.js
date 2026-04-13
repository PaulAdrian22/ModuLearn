const DEFAULTS = {
  scenario: 'standard',
  trialCreditUsd: 200,
  trialDays: 30,
  payg: false,

  // Baseline rates/usage assumptions (edit to your Azure region and SKU pricing).
  appServiceUsdPerMonth: 13.0,
  mysqlUsdPerMonth: 26.0,

  blobStoredGb: 10,
  blobStorageUsdPerGbMonth: 0.02,

  outboundDataGb: 30,
  outboundFreeGb: 5,
  outboundUsdPerGb: 0.087,

  appInsightsIngestGb: 1,
  appInsightsUsdPerGb: 2.76,

  blobWriteOpsMillion: 2,
  blobWriteOpsUsdPerMillion: 0.05,
  blobReadOpsMillion: 5,
  blobReadOpsUsdPerMillion: 0.004
};

const SCENARIOS = {
  lean: {
    appServiceUsdPerMonth: 13.0,
    mysqlUsdPerMonth: 18.0,
    blobStoredGb: 5,
    outboundDataGb: 10,
    appInsightsIngestGb: 0.5,
    blobWriteOpsMillion: 1,
    blobReadOpsMillion: 2
  },
  standard: {
    appServiceUsdPerMonth: 13.0,
    mysqlUsdPerMonth: 26.0,
    blobStoredGb: 10,
    outboundDataGb: 30,
    appInsightsIngestGb: 1,
    blobWriteOpsMillion: 2,
    blobReadOpsMillion: 5
  },
  heavy: {
    appServiceUsdPerMonth: 26.0,
    mysqlUsdPerMonth: 52.0,
    blobStoredGb: 40,
    outboundDataGb: 120,
    appInsightsIngestGb: 5,
    blobWriteOpsMillion: 8,
    blobReadOpsMillion: 20
  }
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const output = {};
  for (const arg of argv) {
    if (!arg.startsWith('--') || !arg.includes('=')) continue;
    const [rawKey, ...rawValue] = arg.slice(2).split('=');
    output[rawKey] = rawValue.join('=');
  }
  return output;
}

function buildConfig() {
  const args = parseArgs(process.argv.slice(2));
  const scenario = String(args.scenario || DEFAULTS.scenario).trim().toLowerCase();

  const scenarioConfig = SCENARIOS[scenario] || SCENARIOS.standard;
  const merged = { ...DEFAULTS, ...scenarioConfig };

  return {
    scenario,
    trialCreditUsd: toNumber(args.trialCreditUsd, merged.trialCreditUsd),
    trialDays: toNumber(args.trialDays, merged.trialDays),
    payg: toBoolean(args.payg, merged.payg),

    appServiceUsdPerMonth: toNumber(args.appServiceUsdPerMonth, merged.appServiceUsdPerMonth),
    mysqlUsdPerMonth: toNumber(args.mysqlUsdPerMonth, merged.mysqlUsdPerMonth),

    blobStoredGb: toNumber(args.blobStoredGb, merged.blobStoredGb),
    blobStorageUsdPerGbMonth: toNumber(args.blobStorageUsdPerGbMonth, merged.blobStorageUsdPerGbMonth),

    outboundDataGb: toNumber(args.outboundDataGb, merged.outboundDataGb),
    outboundFreeGb: toNumber(args.outboundFreeGb, merged.outboundFreeGb),
    outboundUsdPerGb: toNumber(args.outboundUsdPerGb, merged.outboundUsdPerGb),

    appInsightsIngestGb: toNumber(args.appInsightsIngestGb, merged.appInsightsIngestGb),
    appInsightsUsdPerGb: toNumber(args.appInsightsUsdPerGb, merged.appInsightsUsdPerGb),

    blobWriteOpsMillion: toNumber(args.blobWriteOpsMillion, merged.blobWriteOpsMillion),
    blobWriteOpsUsdPerMillion: toNumber(args.blobWriteOpsUsdPerMillion, merged.blobWriteOpsUsdPerMillion),
    blobReadOpsMillion: toNumber(args.blobReadOpsMillion, merged.blobReadOpsMillion),
    blobReadOpsUsdPerMillion: toNumber(args.blobReadOpsUsdPerMillion, merged.blobReadOpsUsdPerMillion)
  };
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function calculate(config) {
  const outboundBillableGb = Math.max(0, config.outboundDataGb - config.outboundFreeGb);

  const monthlyBreakdown = {
    appService: config.appServiceUsdPerMonth,
    mysql: config.mysqlUsdPerMonth,
    blobStorage: config.blobStoredGb * config.blobStorageUsdPerGbMonth,
    outbound: outboundBillableGb * config.outboundUsdPerGb,
    appInsights: config.appInsightsIngestGb * config.appInsightsUsdPerGb,
    blobWrites: config.blobWriteOpsMillion * config.blobWriteOpsUsdPerMillion,
    blobReads: config.blobReadOpsMillion * config.blobReadOpsUsdPerMillion
  };

  const estimatedMonthly = Object.values(monthlyBreakdown).reduce((sum, part) => sum + part, 0);
  const estimatedDaily = estimatedMonthly / 30;
  const estimatedTrialSpend = estimatedDaily * config.trialDays;

  const trialCreditEnough = estimatedTrialSpend <= config.trialCreditUsd;
  const daysCreditWouldLast = estimatedDaily > 0 ? config.trialCreditUsd / estimatedDaily : Number.POSITIVE_INFINITY;

  // Azure Free Account behavior: credits expire in 30 days, then resources stop unless upgraded.
  const survivesAfterTrialWithoutUpgrade = false;
  const survivesAfterTrialWithPayg = config.payg;

  return {
    monthlyBreakdown,
    estimatedMonthly,
    estimatedDaily,
    estimatedTrialSpend,
    trialCreditEnough,
    daysCreditWouldLast,
    survivesAfterTrialWithoutUpgrade,
    survivesAfterTrialWithPayg
  };
}

function printBreakdown(rows) {
  const headers = ['Item', 'USD / month'];
  const data = rows.map((row) => [row.label, row.value.toFixed(2)]);
  const table = [headers, ...data];

  const widths = [0, 0];
  for (const line of table) {
    widths[0] = Math.max(widths[0], String(line[0]).length);
    widths[1] = Math.max(widths[1], String(line[1]).length);
  }

  for (const line of table) {
    console.log(`${String(line[0]).padEnd(widths[0], ' ')} | ${String(line[1]).padStart(widths[1], ' ')}`);
  }
}

function run() {
  const config = buildConfig();
  const result = calculate(config);

  const rows = [
    { label: 'App Service', value: result.monthlyBreakdown.appService },
    { label: 'MySQL Flexible Server', value: result.monthlyBreakdown.mysql },
    { label: 'Blob Storage Capacity', value: result.monthlyBreakdown.blobStorage },
    { label: 'Outbound Data', value: result.monthlyBreakdown.outbound },
    { label: 'Application Insights', value: result.monthlyBreakdown.appInsights },
    { label: 'Blob Write Operations', value: result.monthlyBreakdown.blobWrites },
    { label: 'Blob Read Operations', value: result.monthlyBreakdown.blobReads }
  ];

  console.log('Azure Trial Viability Estimate');
  console.log('');
  console.log(`Scenario: ${config.scenario}`);
  console.log(`Trial Credit: USD ${config.trialCreditUsd.toFixed(2)} for ${config.trialDays} days`);
  console.log('');

  printBreakdown(rows);
  console.log('');

  const monthly = roundMoney(result.estimatedMonthly);
  const trialSpend = roundMoney(result.estimatedTrialSpend);
  const daysLast = roundMoney(result.daysCreditWouldLast);

  console.log(`Estimated Monthly Cost (post-trial): USD ${monthly.toFixed(2)}`);
  console.log(`Estimated Spend During Trial Window: USD ${trialSpend.toFixed(2)}`);
  console.log(`Credit Coverage by Pure Spend: ~${daysLast.toFixed(2)} days`);
  console.log(`Trial Credit Sufficient for ${config.trialDays} days: ${result.trialCreditEnough ? 'YES' : 'NO'}`);
  console.log('');

  console.log('Day-31 Survivability:');
  console.log(`Without upgrading to Pay-As-You-Go: ${result.survivesAfterTrialWithoutUpgrade ? 'RUNNING' : 'STOPPED'}`);
  console.log(`With Pay-As-You-Go enabled: ${result.survivesAfterTrialWithPayg ? 'RUNNING (billed monthly)' : 'NOT ENABLED'}`);
  console.log('');

  console.log('Notes:');
  console.log('- This is an estimate. Replace rates with your actual Azure region/SKU pricing.');
  console.log('- Frontend on GitHub Pages is not included (free).');
  console.log('- Trial credits expire at day 30 regardless of remaining balance.');
}

run();
