const DEFAULT_SETTINGS = {
  // apiBaseUrl: 'https://code-analytics-api.onrender.com/api/v1'
  apiBaseUrl: 'http://localhost:8000/api/v1'
};

const LARGEST_FILES_PAGE_SIZE = 10;
const FOLDER_STATS_PAGE_SIZE = 10;
const ISSUES_PAGE_SIZE = 10;
const REPORT_THEME_STORAGE_KEY = 'reportTheme';
const DASHBOARD_MODE_STORAGE_KEY = 'dashboardMode';
const params = new URLSearchParams(window.location.search);

const elements = {
  heroBrand: document.getElementById('heroBrand'),
  heroTitlePrefix: document.getElementById('heroTitlePrefix'),
  heroTitleMain: document.getElementById('heroTitleMain'),
  heroTitleSuffix: document.getElementById('heroTitleSuffix'),
  heroSubtitle: document.getElementById('heroSubtitle'),
  heroTopCta: document.getElementById('heroTopCta'),
  heroPrimaryCta: document.getElementById('heroPrimaryCta'),
  heroSecondaryCta: document.getElementById('heroSecondaryCta'),
  reportTitle: document.getElementById('reportTitle'),
  reportSubtitle: document.getElementById('reportSubtitle'),
  githubLink: document.getElementById('githubLink'),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-option]')),
  messagePanel: document.getElementById('messagePanel'),
  messageTitle: document.getElementById('messageTitle'),
  messageText: document.getElementById('messageText'),
  dashboardModeButtons: Array.from(document.querySelectorAll('[data-dashboard-mode-option]')),
  alertList: document.getElementById('alertList'),
  trendList: document.getElementById('trendList'),
  executiveHeadline: document.getElementById('executiveHeadline'),
  executiveNarrative: document.getElementById('executiveNarrative'),
  healthGauge: document.getElementById('healthGauge'),
  healthScore: document.getElementById('healthScore'),
  healthStatus: document.getElementById('healthStatus'),
  readinessStatus: document.getElementById('readinessStatus'),
  scanStatus: document.getElementById('scanStatus'),
  scanProgress: document.getElementById('scanProgress'),
  totalFiles: document.getElementById('totalFiles'),
  totalLoc: document.getElementById('totalLoc'),
  riskCategoryList: document.getElementById('riskCategoryList'),
  severitySummary: document.getElementById('severitySummary'),
  readinessSummary: document.getElementById('readinessSummary'),
  debtBreakdown: document.getElementById('debtBreakdown'),
  riskModulesList: document.getElementById('riskModulesList'),
  fileTypeSummary: document.getElementById('fileTypeSummary'),
  fileTypeSegments: document.getElementById('fileTypeSegments'),
  fileTypeChart: document.getElementById('fileTypeChart'),
  fileTypeTotal: document.getElementById('fileTypeTotal'),
  fileTypeInsights: document.getElementById('fileTypeInsights'),
  contextList: document.getElementById('contextList'),
  metricsGrid: document.getElementById('metricsGrid'),
  codeOwnershipList: document.getElementById('codeOwnershipList'),
  complexityList: document.getElementById('complexityList'),
  largestFilesBody: document.getElementById('largestFilesBody'),
  largestFilesPagination: document.getElementById('largestFilesPagination'),
  largestFilesPageInfo: document.getElementById('largestFilesPageInfo'),
  largestFilesPrevButton: document.getElementById('largestFilesPrevButton'),
  largestFilesNextButton: document.getElementById('largestFilesNextButton'),
  folderStatsBody: document.getElementById('folderStatsBody'),
  folderStatsPagination: document.getElementById('folderStatsPagination'),
  folderStatsPageInfo: document.getElementById('folderStatsPageInfo'),
  folderStatsPrevButton: document.getElementById('folderStatsPrevButton'),
  folderStatsNextButton: document.getElementById('folderStatsNextButton'),
  issuesBody: document.getElementById('issuesBody'),
  issuesPagination: document.getElementById('issuesPagination'),
  issuesPageInfo: document.getElementById('issuesPageInfo'),
  issuesPrevButton: document.getElementById('issuesPrevButton'),
  issuesNextButton: document.getElementById('issuesNextButton'),
  issueFilterSummary: document.getElementById('issueFilterSummary'),
  issueFilterLabel: document.getElementById('issueFilterLabel'),
  clearIssueFilterButton: document.getElementById('clearIssueFilterButton'),
  suggestionsList: document.getElementById('suggestionsList'),
  dependencyList: document.getElementById('dependencyList'),
  aiSummaryBadge: document.getElementById('aiSummaryBadge'),
  aiSummaryButton: document.getElementById('aiSummaryButton'),
  aiSummaryHeadline: document.getElementById('aiSummaryHeadline'),
  aiPlainSummary: document.getElementById('aiPlainSummary'),
  aiTechnicalSummary: document.getElementById('aiTechnicalSummary'),
  aiStrengthsList: document.getElementById('aiStrengthsList'),
  aiConcernsList: document.getElementById('aiConcernsList'),
  aiQuickWinsList: document.getElementById('aiQuickWinsList'),
  aiConfidenceNote: document.getElementById('aiConfidenceNote')
};

let currentScanId = '';
let currentScan = null;
let activeIssueFilter = null;
const paginatedSections = {
  largestFiles: { items: [], page: 1 },
  folderStats: { items: [], page: 1 },
  issues: { items: [], page: 1 }
};

function applyReportTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  elements.themeButtons.forEach((button) => {
    const isActive = button.dataset.themeOption === nextTheme;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function initializeReportTheme() {
  let storedTheme = 'dark';
  try {
    storedTheme = localStorage.getItem(REPORT_THEME_STORAGE_KEY) || 'dark';
  } catch {
    storedTheme = 'dark';
  }
  applyReportTheme(storedTheme);

  elements.themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = button.dataset.themeOption === 'light' ? 'light' : 'dark';
      applyReportTheme(nextTheme);
      try {
        localStorage.setItem(REPORT_THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Theme persistence is optional; the visual toggle should still work.
      }
    });
  });
}

function applyDashboardMode(mode) {
  const nextMode = mode === 'technical' ? 'technical' : 'business';
  document.body.dataset.dashboardMode = nextMode;
  elements.dashboardModeButtons.forEach((button) => {
    const isActive = button.dataset.dashboardModeOption === nextMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function initializeDashboardMode() {
  let storedMode = 'business';
  try {
    storedMode = localStorage.getItem(DASHBOARD_MODE_STORAGE_KEY) || 'business';
  } catch {
    storedMode = 'business';
  }
  applyDashboardMode(storedMode);

  elements.dashboardModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.dashboardModeOption === 'technical' ? 'technical' : 'business';
      applyDashboardMode(nextMode);
      try {
        localStorage.setItem(DASHBOARD_MODE_STORAGE_KEY, nextMode);
      } catch {
        // Mode persistence is optional; the controls should still work.
      }
    });
  });
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function formatLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '--';
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeRisk(value) {
  const risk = String(value || 'low').toLowerCase();
  return ['high', 'medium', 'low'].includes(risk) ? risk : 'low';
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  if (typeof value === 'number') {
    return formatNumber(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    return value.length ? `${value.length} items` : 'None';
  }

  if (typeof value === 'object') {
    return `${Object.keys(value).length} items`;
  }

  return String(value);
}

function showMessage(title, text) {
  elements.messageTitle.textContent = title;
  elements.messageText.textContent = text;
  elements.messagePanel.hidden = false;
}

function appendDefinition(list, label, value) {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = label;
  dd.textContent = formatValue(value);
  list.append(dt, dd);
}

function appendEmptyRow(tbody, colspan, text) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.className = 'empty-row';
  cell.textContent = text;
  row.append(cell);
  tbody.append(row);
}

function appendEmptyBlock(container, text) {
  const empty = document.createElement('p');
  empty.className = 'empty-row';
  empty.textContent = text;
  container.append(empty);
}

function getPageItems(section, pageSize) {
  const pageCount = Math.max(1, Math.ceil(section.items.length / pageSize));
  section.page = Math.min(Math.max(section.page, 1), pageCount);
  const start = (section.page - 1) * pageSize;
  return {
    items: section.items.slice(start, start + pageSize),
    pageCount,
    start
  };
}

function updatePagination(section, pageSize, controls, start, pageItemCount) {
  const pageCount = Math.max(1, Math.ceil(section.items.length / pageSize));
  controls.container.hidden = section.items.length <= pageSize;
  controls.prevButton.disabled = section.page === 1;
  controls.nextButton.disabled = section.page === pageCount;
  controls.pageInfo.textContent = `${formatNumber(start + 1)}-${formatNumber(start + pageItemCount)} of ${formatNumber(section.items.length)}`;
}

function setPaginatedItems(sectionName, items, renderPage) {
  paginatedSections[sectionName].items = Array.isArray(items) ? items : [];
  paginatedSections[sectionName].page = 1;
  renderPage();
}

function bindPagination(sectionName, direction, renderPage) {
  paginatedSections[sectionName].page += direction;
  renderPage();
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl)
  };
}

async function apiFetch(apiBaseUrl, path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object' ? body.detail : body;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }

  return body;
}

function appendSignal(container, tone, title, text, filter = null) {
  const item = document.createElement(filter ? 'button' : 'article');
  const label = document.createElement('strong');
  const copy = document.createElement('p');
  item.className = `signal-item ${tone}`;
  if (filter) {
    item.type = 'button';
    item.addEventListener('click', () => {
      setIssueFilter(filter);
      applyDashboardMode('technical');
      document.getElementById('issuesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  label.textContent = title;
  copy.textContent = text;
  item.append(label, copy);
  container.append(item);
}

function renderAlerts(scan) {
  const issues = Array.isArray(scan.issues) ? scan.issues : [];
  const metrics = scan.metrics || {};
  const readiness = scan.manager_report?.release_readiness || {};
  const severity = countBy(issues, (issue) => issue.severity || 'info');
  const issueTypes = countBy(issues, (issue) => issue.type || 'issue');
  const largeFiles = Number(issueTypes.large_file || 0);
  const longFunctions = Number(issueTypes.long_function || 0);
  const debuggerCount = Number(issueTypes.debugger || 0);

  elements.alertList.replaceChildren();

  if (severity.error) {
    appendSignal(elements.alertList, 'error', `${formatNumber(severity.error)} critical findings`, 'Click to drill into critical files and lines.', {
      kind: 'severity',
      value: 'error',
      label: 'Critical findings'
    });
  }
  if (debuggerCount) {
    appendSignal(elements.alertList, 'error', `${formatNumber(debuggerCount)} debugger statements`, 'Remove production debugging statements before release.', {
      kind: 'type',
      value: 'debugger',
      label: 'Debugger statements'
    });
  }
  if (Number(metrics.secrets_detected || 0)) {
    appendSignal(elements.alertList, 'error', `${formatNumber(metrics.secrets_detected)} potential secrets`, 'Click to review files with secret findings.', {
      kind: 'type',
      value: 'secret_detected',
      label: 'Potential secrets'
    });
  }
  if (largeFiles || longFunctions) {
    appendSignal(elements.alertList, 'warning', `${formatNumber(largeFiles + longFunctions)} complexity hotspots`, 'Large files and long functions may slow delivery.', {
      kind: 'types',
      value: ['large_file', 'long_function'],
      label: 'Complexity hotspots'
    });
  }
  if (Number(readiness.percentage) < 60) {
    appendSignal(elements.alertList, 'error', readiness.status || 'Release not ready', `${formatNumber(readiness.percentage)}% readiness needs attention.`);
  }
  if (Number(metrics.test_metrics?.test_coverage_percentage || 0) < 5 && Number(metrics.total_files || 0) > 0) {
    appendSignal(elements.alertList, 'warning', 'Low test signal', 'Few test files were detected for this repository.');
  }

  if (!elements.alertList.children.length) {
    appendSignal(elements.alertList, 'good', 'No critical alerts', 'No release-blocking scanner alerts were detected.');
  }
}

function getPreviousComparableScan(scan, history = []) {
  const currentCreated = new Date(scan.created_at || 0).getTime();
  return history
    .filter((item) => item.id !== scan.id && item._id !== scan._id)
    .filter((item) => item.repository_path === scan.repository_path || item.repository_name === scan.repository_name)
    .filter((item) => (item.branch || 'main') === (scan.branch || 'main'))
    .filter((item) => !currentCreated || new Date(item.created_at || 0).getTime() <= currentCreated)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
}

function trendText(currentValue, previousValue, suffix = '') {
  if (currentValue === null || currentValue === undefined || previousValue === null || previousValue === undefined) {
    return 'Baseline';
  }
  const current = Number(currentValue);
  const previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return 'Baseline';
  }
  const delta = current - previous;
  if (!delta) {
    return `No change at ${formatNumber(current)}${suffix}`;
  }
  const direction = delta > 0 ? 'up' : 'down';
  return `${direction} ${formatNumber(Math.abs(delta))}${suffix} from previous scan`;
}

function renderTrends(scan, history = []) {
  const previous = getPreviousComparableScan(scan, history);
  const currentIssues = Array.isArray(scan.issues) ? scan.issues.length : 0;
  const previousIssues = previous && Array.isArray(previous.issues) ? previous.issues.length : null;
  const currentReadiness = scan.manager_report?.release_readiness?.percentage;
  const previousReadiness = previous?.manager_report?.release_readiness?.percentage;

  elements.trendList.replaceChildren();

  if (!previous) {
    appendSignal(elements.trendList, 'info', 'Baseline scan', 'Run another scan for this repo and branch to show historical movement.');
    return;
  }

  const scoreTone = scan.health_score === null || scan.health_score === undefined || previous.health_score === null || previous.health_score === undefined
    ? 'info'
    : Number(scan.health_score) >= Number(previous.health_score) ? 'good' : 'warning';
  const issueTone = previousIssues === null || previousIssues === undefined
    ? 'info'
    : currentIssues <= previousIssues ? 'good' : 'warning';
  const readinessTone = currentReadiness === null || currentReadiness === undefined || previousReadiness === null || previousReadiness === undefined
    ? 'info'
    : Number(currentReadiness) >= Number(previousReadiness) ? 'good' : 'warning';

  appendSignal(elements.trendList, scoreTone, 'Health score', trendText(scan.health_score, previous.health_score, '%'));
  appendSignal(elements.trendList, issueTone, 'Quality signals', trendText(currentIssues, previousIssues));
  appendSignal(elements.trendList, readinessTone, 'Release readiness', trendText(currentReadiness, previousReadiness, '%'));
}

async function loadTrendHistory(apiBaseUrl, scan) {
  try {
    const scans = await apiFetch(apiBaseUrl, '/basic-scans?limit=100');
    renderTrends(scan, Array.isArray(scans) ? scans : []);
  } catch {
    renderTrends(scan, []);
  }
}

function issueMatchesFilter(issue, filter) {
  if (!filter) {
    return true;
  }
  if (filter.kind === 'severity') {
    return (issue.severity || 'info') === filter.value;
  }
  if (filter.kind === 'type') {
    return (issue.type || '') === filter.value;
  }
  if (filter.kind === 'types') {
    return filter.value.includes(issue.type || '');
  }
  if (filter.kind === 'module') {
    return String(issue.file || '').startsWith(filter.value);
  }
  return true;
}

function setIssueFilter(filter) {
  activeIssueFilter = filter;
  renderIssues(currentScan?.issues || []);
}

function clearIssueFilter() {
  activeIssueFilter = null;
  renderIssues(currentScan?.issues || []);
}

function renderSummary(scan) {
  const metrics = scan.metrics || {};
  const readiness = scan.manager_report?.release_readiness || {};
  const repoName = scan.repository_name || scan.repository_path || params.get('repository_url') || 'Code Analytics';
  const branch = scan.branch || params.get('branch') || '';
  const healthScore = clampPercent(scan.health_score);
  const readinessPercentage = Number.isFinite(Number(readiness.percentage)) ? `${readiness.percentage}%` : 'Release readiness pending';

  renderHeroSummary(scan, repoName, branch);
  elements.reportTitle.textContent = repoName;
  elements.reportSubtitle.textContent = branch ? `Branch: ${branch}` : 'Executive scan from the browser extension.';
  elements.healthGauge.style.setProperty('--score-percent', `${healthScore}%`);
  elements.healthScore.textContent = Number.isFinite(Number(scan.health_score)) ? `${scan.health_score}%` : '--';
  elements.healthStatus.textContent = scan.health_status || 'Not scored';
  elements.readinessStatus.textContent = readiness.status ? `${readiness.status} (${readinessPercentage})` : readinessPercentage;
  elements.scanStatus.textContent = scan.status || '--';
  elements.scanProgress.textContent = `${Math.round(Number(scan.progress) || 0)}%`;
  elements.totalFiles.textContent = formatNumber(metrics.total_files);
  elements.totalLoc.textContent = `${formatNumber(metrics.code_lines || metrics.total_lines_of_code)} LOC`;
  elements.executiveHeadline.textContent = buildExecutiveHeadline(scan);
  elements.executiveNarrative.textContent = buildExecutiveNarrative(scan);
}

function renderHeroSummary(scan, repoName, branch) {
  const metrics = scan.metrics || {};
  const issues = Array.isArray(scan.issues) ? scan.issues : [];
  const score = Number(scan.health_score);
  const status = scan.health_status || 'Not scored';
  const branchLabel = branch ? `${branch} branch` : 'selected branch';
  const fileCount = formatNumber(metrics.total_files);
  const issueCount = formatNumber(issues.length);

  elements.heroBrand.textContent = repoName;
  elements.heroTitlePrefix.textContent = Number.isFinite(score) ? `${scan.health_score}%` : 'Live';
  elements.heroTitleMain.textContent = 'CODE HEALTH';
  elements.heroTitleSuffix.textContent = status;
  elements.heroSubtitle.textContent = `Browser extension report for ${branchLabel}: ${fileCount} files reviewed with ${issueCount} quality signals.`;
  elements.heroTopCta.textContent = 'View Report';
  elements.heroPrimaryCta.textContent = 'View analytics';
  elements.heroSecondaryCta.textContent = 'Open AI summary';
}

function renderHeroMessage(prefix, main, suffix, subtitle) {
  elements.heroBrand.textContent = 'Code Analytics';
  elements.heroTitlePrefix.textContent = prefix;
  elements.heroTitleMain.textContent = main;
  elements.heroTitleSuffix.textContent = suffix;
  elements.heroSubtitle.textContent = subtitle;
  elements.heroTopCta.textContent = 'View Report';
  elements.heroPrimaryCta.textContent = 'View analytics';
  elements.heroSecondaryCta.textContent = 'Open AI summary';
}

function buildExecutiveHeadline(scan) {
  const score = Number(scan.health_score);
  const readiness = scan.manager_report?.release_readiness?.status;
  if (!Number.isFinite(score)) {
    return 'Repository health is being evaluated.';
  }
  if (score >= 85) {
    return 'Strong codebase health with manageable follow-up work.';
  }
  if (score >= 70) {
    return 'Generally healthy, with a few risks to address before scaling.';
  }
  if (score >= 50) {
    return 'Moderate delivery risk: prioritize quality fixes before the next release.';
  }
  return readiness ? `${readiness}: leadership attention recommended.` : 'Elevated risk: leadership attention recommended.';
}

function buildExecutiveNarrative(scan) {
  const issues = Array.isArray(scan.issues) ? scan.issues : [];
  const severity = countBy(issues, (issue) => issue.severity || 'info');
  const blockers = scan.manager_report?.release_readiness?.blocking_issues || [];
  const blockerText = blockers.length ? ` Key blockers: ${blockers.slice(0, 2).join('; ')}.` : '';
  return `The scan found ${formatNumber(issues.length)} quality signals across the repository, including ${formatNumber(severity.error || 0)} critical and ${formatNumber(severity.warning || 0)} warning-level findings.${blockerText} Use the action list below to focus remediation effort.`;
}

function renderSeveritySummary(issues = []) {
  const severity = countBy(issues, (issue) => issue.severity || 'info');
  const total = issues.length || 0;
  const cards = [
    ['error', 'Critical', severity.error || 0, 'Release blockers'],
    ['warning', 'Warnings', severity.warning || 0, 'Quality risks'],
    ['info', 'Info', severity.info || 0, 'Improvement notes']
  ];

  elements.severitySummary.replaceChildren();

  const overview = document.createElement('div');
  const overviewCopy = document.createElement('div');
  const overviewLabel = document.createElement('span');
  const overviewValue = document.createElement('strong');
  const overviewText = document.createElement('p');
  overview.className = 'severity-overview';
  overviewLabel.textContent = 'Total signals';
  overviewValue.textContent = formatNumber(total);
  overviewText.textContent = total
    ? 'Issues grouped by impact so the riskiest work is visible first.'
    : 'No quality issues were reported for this scan.';
  overviewCopy.append(overviewLabel, overviewValue, overviewText);
  overview.append(overviewCopy);
  elements.severitySummary.append(overview);

  const strip = document.createElement('div');
  strip.className = 'severity-strip';
  cards.forEach(([tone, , value]) => {
    const segment = document.createElement('span');
    const share = total ? (Number(value || 0) / total) * 100 : 0;
    segment.className = `severity-segment ${tone}`;
    segment.style.width = `${Math.max(total && value ? 8 : 0, share)}%`;
    strip.append(segment);
  });
  elements.severitySummary.append(strip);

  const list = document.createElement('div');
  list.className = 'severity-list';
  cards.forEach(([tone, label, value, text]) => {
    const card = document.createElement('button');
    const badge = document.createElement('span');
    const count = document.createElement('strong');
    const copy = document.createElement('p');
    card.type = 'button';
    card.className = `severity-card ${tone}`;
    card.disabled = !value;
    card.addEventListener('click', () => {
      setIssueFilter({ kind: 'severity', value: tone, label: `${label} findings` });
      applyDashboardMode('technical');
      document.getElementById('issuesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    badge.textContent = label;
    count.textContent = formatNumber(value);
    copy.textContent = text;
    card.append(badge, count, copy);
    list.append(card);
  });
  elements.severitySummary.append(list);
}

function renderRiskCategories(categories = []) {
  elements.riskCategoryList.replaceChildren();
  if (!categories.length) {
    appendEmptyBlock(elements.riskCategoryList, 'No business risk categories are available for this scan.');
    return;
  }

  categories.forEach((category) => {
    const risk = normalizeRisk(category.level);
    const item = document.createElement('article');
    const top = document.createElement('div');
    const title = document.createElement('strong');
    const level = document.createElement('span');
    const bar = document.createElement('div');
    const fill = document.createElement('span');
    const reason = document.createElement('p');
    item.className = `risk-item ${risk}`;
    top.className = 'risk-item-top';
    title.textContent = category.name || 'Risk category';
    level.className = `risk-pill ${risk}`;
    level.textContent = risk;
    bar.className = 'risk-meter';
    fill.style.width = `${clampPercent(category.score)}%`;
    reason.textContent = category.reason || 'This category summarizes related scan signals.';
    top.append(title, level);
    bar.append(fill);
    item.append(top, bar, reason);
    elements.riskCategoryList.append(item);
  });
}

function renderReadiness(readiness = {}) {
  const score = clampPercent(readiness.percentage);
  const blockers = Array.isArray(readiness.blocking_issues) ? readiness.blocking_issues : [];
  elements.readinessSummary.replaceChildren();

  const gauge = document.createElement('div');
  const value = document.createElement('strong');
  const label = document.createElement('span');
  gauge.className = 'readiness-gauge';
  gauge.style.setProperty('--score-percent', `${score}%`);
  value.textContent = Number.isFinite(Number(readiness.percentage)) ? `${readiness.percentage}%` : '--';
  label.textContent = readiness.status || 'Pending';
  gauge.append(value, label);

  const list = document.createElement('ul');
  list.className = 'compact-list';
  blockers.slice(0, 4).forEach((blocker) => {
    const item = document.createElement('li');
    item.textContent = blocker;
    list.append(item);
  });
  if (!blockers.length) {
    const item = document.createElement('li');
    item.className = 'empty-row';
    item.textContent = 'No release blockers reported by the scanner.';
    list.append(item);
  }

  elements.readinessSummary.append(gauge, list);
}

function renderDebtBreakdown(debt = {}) {
  const bySeverity = debt.debt_by_severity || {};
  const rows = [
    ['High', bySeverity.high || debt.high_priority_hours || 0, 'error'],
    ['Medium', bySeverity.medium || debt.medium_priority_hours || 0, 'warning'],
    ['Low', bySeverity.low || debt.low_priority_hours || 0, 'info']
  ];
  const total = rows.reduce((sum, [, hours]) => sum + Number(hours || 0), 0) || Number(debt.estimated_hours || 0);
  elements.debtBreakdown.replaceChildren();

  const totalCard = document.createElement('div');
  const totalLabel = document.createElement('span');
  const totalValue = document.createElement('strong');
  const totalTrend = document.createElement('p');
  totalCard.className = 'debt-total';
  totalLabel.textContent = 'Estimated effort';
  totalValue.textContent = `${formatNumber(debt.estimated_hours || total)}h`;
  totalTrend.textContent = debt.debt_trend || 'Baseline scan';
  totalCard.append(totalLabel, totalValue, totalTrend);
  elements.debtBreakdown.append(totalCard);

  rows.forEach(([label, hours, tone]) => {
    const row = document.createElement('div');
    const name = document.createElement('span');
    const bar = document.createElement('div');
    const fill = document.createElement('span');
    const value = document.createElement('strong');
    row.className = `debt-row ${tone}`;
    name.textContent = label;
    bar.className = 'debt-bar';
    fill.style.width = `${total ? Math.max(5, (Number(hours || 0) / total) * 100) : 0}%`;
    value.textContent = `${formatNumber(hours)}h`;
    bar.append(fill);
    row.append(name, bar, value);
    elements.debtBreakdown.append(row);
  });
}

function renderRiskModules(modules = []) {
  elements.riskModulesList.replaceChildren();
  if (!modules.length) {
    appendEmptyBlock(elements.riskModulesList, 'No module hotspots were identified.');
    return;
  }

  modules.slice(0, 5).forEach((module) => {
    const risk = normalizeRisk(module.risk);
    const item = document.createElement('article');
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    const reason = document.createElement('p');
    item.className = `module-item ${risk}`;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    title.textContent = module.module || 'Repository module';
    meta.textContent = `${risk} risk - ${formatNumber(module.issue_count || 0)} issues - ${formatNumber(module.lines || 0)} lines`;
    reason.textContent = module.reason || 'Review this area first because it concentrates risk signals.';
    item.addEventListener('click', () => {
      setIssueFilter({ kind: 'module', value: module.module || '', label: `${module.module || 'Module'} findings` });
      applyDashboardMode('technical');
      document.getElementById('issuesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        item.click();
      }
    });
    item.append(title, meta, reason);
    elements.riskModulesList.append(item);
  });
}

function renderFileTypeChart(fileTypes = {}) {
  const allEntries = Object.entries(fileTypes).sort((a, b) => b[1] - a[1]);
  const entries = allEntries.slice(0, 8);
  const total = allEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
  const max = Math.max(...entries.map(([, count]) => Number(count) || 0), 1);
  const primary = allEntries[0];
  const secondary = allEntries[1];
  const primaryShare = primary && total ? Math.round(((Number(primary[1]) || 0) / total) * 100) : 0;
  const topThreeCount = allEntries.slice(0, 3).reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
  const topThreeShare = total ? Math.round((topThreeCount / total) * 100) : 0;

  elements.fileTypeSummary.replaceChildren();
  elements.fileTypeSegments.replaceChildren();
  elements.fileTypeChart.replaceChildren();
  elements.fileTypeInsights.replaceChildren();
  elements.fileTypeTotal.textContent = `${formatNumber(total)} files`;

  if (!allEntries.length) {
    elements.fileTypeTotal.textContent = '--';
    appendEmptyBlock(elements.fileTypeSummary, 'No file type distribution is available.');
    appendEmptyBlock(elements.fileTypeSegments, 'No composition data available.');
    appendEmptyBlock(elements.fileTypeChart, 'No file type distribution is available.');
    appendEmptyBlock(elements.fileTypeInsights, 'No technology insights are available.');
    return;
  }

  [
    ['File types', allEntries.length, 'Unique technologies detected in this repository.'],
    ['Total files', total, 'Files included in the scan composition.'],
    ['Primary stack', primary ? primary[0] || 'No extension' : '--', primary ? `${primaryShare}% of scanned files.` : 'Not available.']
  ].forEach(([label, value, copy]) => {
    const tile = document.createElement('article');
    const tileLabel = document.createElement('span');
    const tileValue = document.createElement('strong');
    const tileCopy = document.createElement('p');
    tile.className = 'technology-stat';
    tileLabel.textContent = label;
    tileValue.textContent = typeof value === 'number' ? formatNumber(value) : value;
    tileCopy.textContent = copy;
    tile.append(tileLabel, tileValue, tileCopy);
    elements.fileTypeSummary.append(tile);
  });

  [
    [
      'Dominant technology',
      primary ? `${primary[0] || 'No extension'} leads the repository at ${primaryShare}% of files.` : 'No dominant technology detected.'
    ],
    [
      'Concentration',
      `The top 3 file types represent ${topThreeShare}% of scanned files, which ${topThreeShare >= 75 ? 'suggests a focused codebase.' : 'indicates a broader multi-technology footprint.'}`
    ],
    [
      'Review focus',
      secondary ? `Prioritize review coverage for ${primary[0] || 'the primary stack'} and ${secondary[0] || 'the secondary stack'} changes.` : 'Prioritize review coverage for the primary stack.'
    ]
  ].forEach(([label, copy]) => {
    const item = document.createElement('article');
    const title = document.createElement('strong');
    const text = document.createElement('p');
    item.className = 'insight-item';
    title.textContent = label;
    text.textContent = copy;
    item.append(title, text);
    elements.fileTypeInsights.append(item);
  });

  entries.forEach(([type, count], index) => {
    const segment = document.createElement('span');
    const share = total ? ((Number(count) || 0) / total) * 100 : 0;
    segment.className = `segment segment-${index + 1}`;
    segment.style.width = `${Math.max(3, share)}%`;
    segment.title = `${type || 'No extension'}: ${Math.round(share)}%`;
    elements.fileTypeSegments.append(segment);
  });

  entries.forEach(([type, count], index) => {
    const share = total ? Math.round(((Number(count) || 0) / total) * 100) : 0;
    const row = document.createElement('div');
    const rank = document.createElement('span');
    const labelWrap = document.createElement('div');
    const label = document.createElement('strong');
    const detail = document.createElement('span');
    const bar = document.createElement('div');
    const fill = document.createElement('span');
    const value = document.createElement('div');
    row.className = 'technology-chart-row';
    rank.className = 'technology-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    labelWrap.className = 'technology-label';
    label.textContent = type || 'No extension';
    detail.textContent = `${formatNumber(count)} files`;
    labelWrap.append(label, detail);
    bar.className = 'technology-bar';
    fill.style.width = `${Math.max(4, ((Number(count) || 0) / max) * 100)}%`;
    value.className = 'technology-share';
    value.textContent = `${share}%`;
    bar.append(fill);
    row.append(rank, labelWrap, bar, value);
    elements.fileTypeChart.append(row);
  });
}

function renderContext(scan) {
  const githubUrl = params.get('github_url');
  const context = [
    ['Scan ID', params.get('scan_id') || scan.id || scan._id],
    ['Repository URL', params.get('repository_url') || scan.repository_path],
    ['Branch', params.get('branch') || scan.branch],
    ['GitHub Path', params.get('github_path')],
    ['GitHub URL', githubUrl],
    ['Created', scan.created_at ? new Date(scan.created_at).toLocaleString() : '']
  ];

  elements.contextList.replaceChildren();
  context.forEach(([label, value]) => appendDefinition(elements.contextList, label, value));

  if (githubUrl) {
    elements.githubLink.href = githubUrl;
    elements.githubLink.hidden = false;
  }
}

function metricIssueFilter(key) {
  const filters = {
    debugger_statements: { kind: 'type', value: 'debugger', label: 'Debugger statements' },
    secrets_detected: { kind: 'type', value: 'secret_detected', label: 'Potential secrets' },
    console_logs: { kind: 'type', value: 'console_log', label: 'Console log statements' },
    todo_count: { kind: 'type', value: 'todo_fixme', label: 'TODO/FIXME findings' },
    fixme_count: { kind: 'type', value: 'todo_fixme', label: 'TODO/FIXME findings' },
    commented_out_code: { kind: 'type', value: 'commented_out_code', label: 'Commented-out code' }
  };
  return filters[key] || null;
}

function formatMetricValue(key, value) {
  if (key === 'code_duplication_percentage') {
    return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString()}%` : '--';
  }
  return formatValue(value);
}

function makeMetricTile(key, labelText, value, helperText, className = 'metric-tile') {
  const filter = metricIssueFilter(key);
  const tile = document.createElement(filter ? 'button' : 'article');
  const label = document.createElement('span');
  const detail = document.createElement('strong');
  const helper = document.createElement('p');
  if (filter) {
    tile.type = 'button';
    tile.addEventListener('click', () => {
      setIssueFilter(filter);
      document.getElementById('issuesBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  tile.className = filter ? `${className} drillable` : className;
  label.textContent = labelText;
  detail.textContent = formatMetricValue(key, value);
  helper.textContent = helperText;
  tile.append(label, detail, helper);
  return tile;
}

function renderMetrics(metrics = {}) {
  elements.metricsGrid.replaceChildren();
  const nestedMetricKeys = new Set([
    'file_types',
    'largest_files',
    'folder_statistics',
    'complexity_metrics',
    'code_ownership'
  ]);

  const preferredMetrics = [
    ['total_files', 'Files', 'Breadth of repository content scanned.'],
    ['total_lines_of_code', 'Total LOC', 'Overall implementation footprint.'],
    ['code_lines', 'Code Lines', 'Executable/source lines reviewed.'],
    ['total_folders', 'Folders', 'Repository structure and module spread.'],
    ['supported_files', 'Supported Files', 'Files included in quality analysis.'],
    ['code_duplication_percentage', 'Duplication', 'Estimated percentage of repeated normalized code lines.'],
    ['secrets_detected', 'Secrets Detected', 'Potential hardcoded secrets found by pattern checks.'],
    ['total_size', 'Total Size', 'Approximate scanned footprint.'],
    ['comment_lines', 'Comment Lines', 'Documentation and inline explanation signal.'],
    ['blank_lines', 'Blank Lines', 'Formatting and spacing volume.']
  ];

  const rendered = new Set();
  preferredMetrics.forEach(([key, labelText, helperText]) => {
    if (!(key in metrics)) {
      return;
    }
    elements.metricsGrid.append(makeMetricTile(key, labelText, metrics[key], helperText));
    rendered.add(key);
  });

  Object.entries(metrics).filter(([key]) => !nestedMetricKeys.has(key) && !rendered.has(key)).slice(0, 4).forEach(([key, value]) => {
    elements.metricsGrid.append(makeMetricTile(key, formatLabel(key), value, 'Additional scan signal for technical review.', 'metric-tile secondary'));
  });

  if (!Object.keys(metrics).length) {
    const empty = document.createElement('p');
    empty.className = 'empty-row';
    empty.textContent = 'No metrics are available for this scan.';
    elements.metricsGrid.append(empty);
  }
}

function renderCodeOwnership(contributors = []) {
  elements.codeOwnershipList.replaceChildren();
  if (!Array.isArray(contributors) || !contributors.length) {
    appendEmptyBlock(elements.codeOwnershipList, 'Contributor data is not available for this scan.');
    return;
  }

  contributors.slice(0, 5).forEach((contributor, index) => {
    const item = document.createElement('article');
    const rank = document.createElement('span');
    const body = document.createElement('div');
    const name = document.createElement('strong');
    const meta = document.createElement('p');
    item.className = 'ownership-item';
    rank.className = 'ownership-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    name.textContent = contributor.login || 'Unknown contributor';
    meta.textContent = `${formatNumber(contributor.contributions || 0)} contributions`;
    body.append(name, meta);
    item.append(rank, body);
    elements.codeOwnershipList.append(item);
  });
}

function appendLargestFileRow(file) {
  const row = document.createElement('tr');
  [
    file.path,
    file.total_lines,
    file.code_lines,
    file.comment_lines,
    file.blank_lines,
    (file.todo_count || 0) + (file.fixme_count || 0)
  ].forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = formatValue(value);
    row.append(cell);
  });
  elements.largestFilesBody.append(row);
}

function renderComplexityMetrics(complexity = {}) {
  elements.complexityList.replaceChildren();
  const entries = [
    ['Average Cyclomatic Complexity', complexity.avg_cyclomatic_complexity],
    ['Max Cyclomatic Complexity', complexity.max_cyclomatic_complexity],
    ['Average Cognitive Complexity', complexity.avg_cognitive_complexity],
    ['Max Cognitive Complexity', complexity.max_cognitive_complexity],
    ['Average Maintainability Index', complexity.avg_maintainability_index]
  ];

  entries.forEach(([label, value]) => appendDefinition(elements.complexityList, label, value));
}

function renderLargestFiles(files = []) {
  setPaginatedItems('largestFiles', files, renderLargestFilePage);
}

function renderLargestFilePage() {
  const section = paginatedSections.largestFiles;
  const { items, start } = getPageItems(section, LARGEST_FILES_PAGE_SIZE);
  elements.largestFilesBody.replaceChildren();

  if (!section.items.length) {
    appendEmptyRow(elements.largestFilesBody, 6, 'No file metrics are available.');
    elements.largestFilesPagination.hidden = true;
    return;
  }

  items.forEach(appendLargestFileRow);
  updatePagination(section, LARGEST_FILES_PAGE_SIZE, {
    container: elements.largestFilesPagination,
    prevButton: elements.largestFilesPrevButton,
    nextButton: elements.largestFilesNextButton,
    pageInfo: elements.largestFilesPageInfo
  }, start, items.length);
}

function appendFolderStatRow(folder) {
  const row = document.createElement('tr');
  [
    folder.folder_path,
    folder.total_files,
    folder.total_lines,
    folder.total_size,
    folder.avg_complexity
  ].forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = formatValue(value);
    row.append(cell);
  });
  elements.folderStatsBody.append(row);
}

function renderFolderStatistics(folders = []) {
  setPaginatedItems('folderStats', folders, renderFolderStatPage);
}

function renderFolderStatPage() {
  const section = paginatedSections.folderStats;
  const { items, start } = getPageItems(section, FOLDER_STATS_PAGE_SIZE);
  elements.folderStatsBody.replaceChildren();

  if (!section.items.length) {
    appendEmptyRow(elements.folderStatsBody, 5, 'No folder statistics are available.');
    elements.folderStatsPagination.hidden = true;
    return;
  }

  items.forEach(appendFolderStatRow);
  updatePagination(section, FOLDER_STATS_PAGE_SIZE, {
    container: elements.folderStatsPagination,
    prevButton: elements.folderStatsPrevButton,
    nextButton: elements.folderStatsNextButton,
    pageInfo: elements.folderStatsPageInfo
  }, start, items.length);
}

function appendIssueRow(issue) {
  const row = document.createElement('tr');
  const severityCell = document.createElement('td');
  const severity = document.createElement('span');
  severity.className = `severity ${issue.severity || 'info'}`;
  severity.textContent = issue.severity || 'info';
  severityCell.append(severity);
  row.append(severityCell);

  [issue.type, issue.file, issue.line, issue.message].forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = formatValue(value);
    row.append(cell);
  });

  elements.issuesBody.append(row);
}

function renderIssuePage() {
  const section = paginatedSections.issues;
  const { items, start } = getPageItems(section, ISSUES_PAGE_SIZE);

  elements.issuesBody.replaceChildren();

  if (!section.items.length) {
    appendEmptyRow(elements.issuesBody, 5, 'No quality issues detected.');
    elements.issuesPagination.hidden = true;
    return;
  }

  items.forEach(appendIssueRow);
  updatePagination(section, ISSUES_PAGE_SIZE, {
    container: elements.issuesPagination,
    prevButton: elements.issuesPrevButton,
    nextButton: elements.issuesNextButton,
    pageInfo: elements.issuesPageInfo
  }, start, items.length);
}

function renderIssues(issues = []) {
  const allIssues = Array.isArray(issues) ? issues : [];
  const filteredIssues = allIssues.filter((issue) => issueMatchesFilter(issue, activeIssueFilter));
  if (activeIssueFilter) {
    elements.issueFilterLabel.textContent = `${activeIssueFilter.label}: ${formatNumber(filteredIssues.length)} of ${formatNumber(allIssues.length)}`;
    elements.issueFilterSummary.hidden = false;
  } else {
    elements.issueFilterSummary.hidden = true;
  }
  setPaginatedItems('issues', filteredIssues, renderIssuePage);
}

function renderSuggestions(suggestions = []) {
  elements.suggestionsList.replaceChildren();

  if (!suggestions.length) {
    const item = document.createElement('li');
    item.className = 'empty-row';
    item.textContent = 'No suggestions available.';
    elements.suggestionsList.append(item);
    return;
  }

  suggestions.forEach((suggestion) => {
    const item = document.createElement('li');
    item.textContent = suggestion;
    elements.suggestionsList.append(item);
  });
}

function renderDependencies(summary = {}) {
  elements.dependencyList.replaceChildren();

  const totalDependencies = Number(summary.total_dependencies || summary.dependencies || 0);
  const totalDevDependencies = Number(summary.total_dev_dependencies || summary.dev_dependencies || 0);
  const possiblyUnused = Number(summary.possibly_unused || 0);
  const hasPackageJson = Boolean(summary.has_package_json);
  const unusedRate = totalDependencies ? Math.round((possiblyUnused / totalDependencies) * 100) : 0;
  const cards = [
    ['Runtime Dependencies', totalDependencies, 'Packages required for the application to run.', 'dependency-card'],
    ['Dev Dependencies', totalDevDependencies, 'Build, test, and tooling packages used by engineers.', 'dependency-card'],
    ['Possibly Unused', possiblyUnused, `${unusedRate}% of runtime dependencies may need review.`, possiblyUnused ? 'dependency-card warning' : 'dependency-card good']
  ];

  cards.forEach(([labelText, value, helperText, className]) => {
    const card = document.createElement('article');
    const label = document.createElement('span');
    const detail = document.createElement('strong');
    const helper = document.createElement('p');
    card.className = className;
    label.textContent = labelText;
    detail.textContent = formatNumber(value);
    helper.textContent = helperText;
    card.append(label, detail, helper);
    elements.dependencyList.append(card);
  });

  const status = document.createElement('article');
  const title = document.createElement('strong');
  const text = document.createElement('p');
  status.className = hasPackageJson ? 'dependency-status good' : 'dependency-status warning';
  title.textContent = hasPackageJson ? 'Dependency manifest found' : 'Dependency manifest missing';
  text.textContent = hasPackageJson
    ? 'Package metadata is available, so dependency health can be tracked over time.'
    : 'No package.json was detected, so dependency visibility may be incomplete.';
  status.append(title, text);
  elements.dependencyList.append(status);
}

function renderSummaryList(listElement, items, emptyText) {
  listElement.replaceChildren();

  if (!Array.isArray(items) || !items.length) {
    const item = document.createElement('li');
    item.className = 'empty-row';
    item.textContent = emptyText;
    listElement.append(item);
    return;
  }

  items.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    listElement.append(item);
  });
}

function setAISummaryStatus(text, tone = 'loading') {
  elements.aiSummaryBadge.textContent = text;
  elements.aiSummaryBadge.classList.remove('ready', 'warning', 'error');
  if (tone === 'success') {
    elements.aiSummaryBadge.classList.add('ready');
  } else if (tone === 'warning') {
    elements.aiSummaryBadge.classList.add('warning');
  } else if (tone === 'error') {
    elements.aiSummaryBadge.classList.add('error');
  }
}

function setAISummaryButtonState(isBusy) {
  elements.aiSummaryButton.disabled = isBusy || !currentScanId;
  elements.aiSummaryButton.textContent = isBusy ? 'Generating...' : 'Get AI Summary';
}

function renderAISummaryIdle() {
  setAISummaryStatus('On demand', 'loading');
  elements.aiSummaryHeadline.textContent = 'Generate an AI summary when you want a faster overview.';
  elements.aiPlainSummary.textContent = 'Click the button to get a simple explanation that non-technical readers can understand.';
  elements.aiTechnicalSummary.textContent = 'You can also generate a short engineering-focused summary based on the saved scan.';
  renderSummaryList(elements.aiStrengthsList, [], 'Generate a summary to see highlights.');
  renderSummaryList(elements.aiConcernsList, [], 'Generate a summary to see the main concerns.');
  renderSummaryList(elements.aiQuickWinsList, [], 'Generate a summary to see suggested next steps.');
  elements.aiConfidenceNote.textContent = 'This is optional and only runs after you click the button.';
  setAISummaryButtonState(false);
}

function renderAISummaryLoading() {
  setAISummaryStatus('Generating...', 'loading');
  elements.aiSummaryHeadline.textContent = 'Building an AI summary for this repository.';
  elements.aiPlainSummary.textContent = 'Preparing a short summary for non-technical readers.';
  elements.aiTechnicalSummary.textContent = 'Preparing a short technical summary from the saved scan.';
  renderSummaryList(elements.aiStrengthsList, [], 'Analyzing strengths...');
  renderSummaryList(elements.aiConcernsList, [], 'Analyzing concerns...');
  renderSummaryList(elements.aiQuickWinsList, [], 'Analyzing next steps...');
  elements.aiConfidenceNote.textContent = 'This usually uses the cached result if one already exists.';
  setAISummaryButtonState(true);
}

function renderAISummary(summaryResponse) {
  const summary = summaryResponse.summary || {};
  const cachedLabel = summaryResponse.cached ? 'Cached summary' : 'Fresh summary';
  setAISummaryStatus(cachedLabel, 'success');
  elements.aiSummaryHeadline.textContent = summary.headline || 'Repository overview ready.';
  elements.aiPlainSummary.textContent = summary.plain_english_summary || 'No plain-English summary is available.';
  elements.aiTechnicalSummary.textContent = summary.technical_summary || 'No technical summary is available.';
  renderSummaryList(elements.aiStrengthsList, summary.key_strengths || [], 'No strengths highlighted.');
  renderSummaryList(elements.aiConcernsList, summary.priority_concerns || [], 'No concerns highlighted.');
  renderSummaryList(elements.aiQuickWinsList, summary.quick_wins || [], 'No quick wins highlighted.');
  elements.aiConfidenceNote.textContent = summary.confidence_note || 'This summary is based on the saved repository scan signals.';
  setAISummaryButtonState(false);
}

function renderAISummaryError(message) {
  setAISummaryStatus('Unavailable', 'warning');
  elements.aiSummaryHeadline.textContent = 'AI summary unavailable right now.';
  elements.aiPlainSummary.textContent = message;
  elements.aiTechnicalSummary.textContent = 'The detailed metrics below are still available for manual review.';
  renderSummaryList(elements.aiStrengthsList, [], 'Try again in a moment.');
  renderSummaryList(elements.aiConcernsList, [], 'No AI concerns available.');
  renderSummaryList(elements.aiQuickWinsList, [], 'No AI quick wins available.');
  elements.aiConfidenceNote.textContent = 'You can still use the scan report even when the AI summary is unavailable.';
  setAISummaryButtonState(false);
}

function renderReport(scan) {
  currentScan = scan;
  activeIssueFilter = null;
  const metrics = scan.metrics || {};
  const managerReport = scan.manager_report || {};
  renderSummary(scan);
  renderAlerts(scan);
  renderTrends(scan, []);
  renderSeveritySummary(scan.issues || []);
  renderRiskCategories(managerReport.risk_categories || []);
  renderReadiness(managerReport.release_readiness || {});
  renderDebtBreakdown(managerReport.technical_debt || {});
  renderRiskModules(managerReport.top_risky_modules || []);
  renderFileTypeChart(metrics.file_types || {});
  renderContext(scan);
  renderMetrics(metrics);
  renderCodeOwnership(metrics.code_ownership || []);
  renderComplexityMetrics(metrics.complexity_metrics || {});
  renderLargestFiles(metrics.largest_files || []);
  renderFolderStatistics(metrics.folder_statistics || []);
  renderIssues(scan.issues || []);
  renderSuggestions(scan.suggestions || []);
  renderDependencies(scan.dependency_summary || {});
}

async function loadAISummary(apiBaseUrl, scanId) {
  renderAISummaryLoading();
  try {
    const summary = await apiFetch(apiBaseUrl, `/basic-scans/${encodeURIComponent(scanId)}/ai-summary`, {
      method: 'POST'
    });
    renderAISummary(summary);
  } catch (error) {
    renderAISummaryError(error.message || 'The AI summary could not be generated.');
  }
}

async function handleAISummaryClick() {
  if (!currentScanId) {
    renderAISummaryError('Load a scan report first.');
    return;
  }

  try {
    const settings = await loadSettings();
    await loadAISummary(settings.apiBaseUrl, currentScanId);
  } catch (error) {
    renderAISummaryError(error.message || 'The AI summary could not be generated.');
  }
}

async function initializeReport() {
  const scanId = params.get('scan_id');

  if (!scanId) {
    showMessage('No scan selected', 'Open this report from the extension after analyzing a repository.');
    renderHeroMessage(
      'No scan',
      'CODE HEALTH',
      'selected',
      'Open this page from the Code Analytics browser extension after running a repository scan.'
    );
    elements.reportSubtitle.textContent = 'No scan id was provided.';
    return;
  }

  try {
    const settings = await loadSettings();
    const scan = await apiFetch(settings.apiBaseUrl, `/basic-scans/${encodeURIComponent(scanId)}`);
    currentScanId = scanId;
    renderReport(scan);
    renderAISummaryIdle();
    loadTrendHistory(settings.apiBaseUrl, scan);
  } catch (error) {
    showMessage('Unable to load report', error.message);
    renderHeroMessage(
      'Report',
      'LOAD',
      'blocked',
      'The browser extension could not load this repository scan from the configured API.'
    );
    elements.reportSubtitle.textContent = 'The extension report could not load scan metrics.';
    renderAISummaryError('Load the scan report first, then the AI summary can be requested.');
  }
}

elements.aiSummaryButton.addEventListener('click', handleAISummaryClick);
elements.largestFilesPrevButton.addEventListener('click', () => {
  bindPagination('largestFiles', -1, renderLargestFilePage);
});
elements.largestFilesNextButton.addEventListener('click', () => {
  bindPagination('largestFiles', 1, renderLargestFilePage);
});
elements.folderStatsPrevButton.addEventListener('click', () => {
  bindPagination('folderStats', -1, renderFolderStatPage);
});
elements.folderStatsNextButton.addEventListener('click', () => {
  bindPagination('folderStats', 1, renderFolderStatPage);
});
elements.issuesPrevButton.addEventListener('click', () => {
  bindPagination('issues', -1, renderIssuePage);
});
elements.issuesNextButton.addEventListener('click', () => {
  bindPagination('issues', 1, renderIssuePage);
});
elements.clearIssueFilterButton.addEventListener('click', clearIssueFilter);
initializeReportTheme();
initializeDashboardMode();
renderAISummaryIdle();
initializeReport();
