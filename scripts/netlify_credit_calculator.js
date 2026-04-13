const DEFAULT_LIMITS = {
  buildMinutes: Number(process.env.NETLIFY_FREE_BUILD_MINUTES || 300),
  bandwidthGb: Number(process.env.NETLIFY_FREE_BANDWIDTH_GB || 100),
  functionInvocations: Number(process.env.NETLIFY_FREE_FUNCTION_INVOCATIONS || 125000)
};

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const token = process.argv.find((arg) => arg.startsWith(prefix));
  if (!token) return fallback;

  const value = Number(token.slice(prefix.length));
  return Number.isFinite(value) ? value : fallback;
}

function pct(used, limit) {
  if (limit <= 0) return 0;
  return (used / limit) * 100;
}

function over(used, limit) {
  return Math.max(0, used - limit);
}

function row(label, used, limit, unit) {
  const percent = pct(used, limit).toFixed(1);
  const overage = over(used, limit);
  const status = overage > 0 ? 'OVER' : 'OK';

  return {
    label,
    used,
    limit,
    unit,
    percent,
    overage,
    status
  };
}

function printTable(rows) {
  const headers = ['Metric', 'Used', 'Free Limit', 'Usage %', 'Overage', 'Status'];
  const values = rows.map((r) => [
    r.label,
    `${r.used} ${r.unit}`,
    `${r.limit} ${r.unit}`,
    `${r.percent}%`,
    `${r.overage} ${r.unit}`,
    r.status
  ]);

  const table = [headers, ...values];
  const widths = headers.map((_, col) =>
    Math.max(...table.map((line) => String(line[col]).length))
  );

  for (const line of table) {
    const out = line
      .map((cell, col) => String(cell).padEnd(widths[col], ' '))
      .join(' | ');
    console.log(out);
  }
}

function run() {
  const deploys = readArg('deploys', 30);
  const avgBuildMinutes = readArg('avg-build-minutes', 4);
  const bandwidthGb = readArg('bandwidth-gb', 80);
  const functionInvocations = readArg('function-invocations', 100000);

  const scenario = (process.argv.find((arg) => arg.startsWith('--scenario=')) || '--scenario=netlify-fullstack')
    .split('=')[1];

  const usage = {
    buildMinutes: Math.round(deploys * avgBuildMinutes),
    bandwidthGb,
    functionInvocations
  };

  if (scenario === 'github-pages-frontend') {
    usage.buildMinutes = 0;
    usage.bandwidthGb = 0;
    usage.functionInvocations = 0;
  }

  const rows = [
    row('Build Minutes', usage.buildMinutes, DEFAULT_LIMITS.buildMinutes, 'min'),
    row('Bandwidth', usage.bandwidthGb, DEFAULT_LIMITS.bandwidthGb, 'GB'),
    row('Functions', usage.functionInvocations, DEFAULT_LIMITS.functionInvocations, 'calls')
  ];

  console.log('Netlify Credit Usage Estimate');
  console.log('');
  console.log(`Scenario: ${scenario}`);
  if (scenario === 'netlify-fullstack') {
    console.log(`Inputs: deploys=${deploys}, avg-build-minutes=${avgBuildMinutes}, bandwidth-gb=${bandwidthGb}, function-invocations=${functionInvocations}`);
  }
  console.log('');
  printTable(rows);
  console.log('');

  const anyOver = rows.some((r) => r.overage > 0);
  if (anyOver) {
    console.log('Recommendation: move frontend to GitHub Pages and keep only required APIs on an external backend to reduce Netlify usage.');
  } else {
    console.log('Recommendation: current estimate fits within free credits. Keep monitoring monthly usage.');
  }

  console.log('');
  console.log('Tip: if your Netlify plan limits changed, set NETLIFY_FREE_BUILD_MINUTES, NETLIFY_FREE_BANDWIDTH_GB, and NETLIFY_FREE_FUNCTION_INVOCATIONS before running this script.');
}

run();
