const DEFAULT_SETTINGS = {
  apiBaseUrl: 'http://localhost:8000/api/v1'
};

const params = new URLSearchParams(window.location.search);

const elements = {
  reportTitle: document.getElementById('reportTitle'),
  reportSubtitle: document.getElementById('reportSubtitle'),
  githubLink: document.getElementById('githubLink'),
  messagePanel: document.getElementById('messagePanel'),
  messageTitle: document.getElementById('messageTitle'),
  messageText: document.getElementById('messageText'),
  healthScore: document.getElementById('healthScore'),
  healthStatus: document.getElementById('healthStatus'),
  scanStatus: document.getElementById('scanStatus'),
  scanProgress: document.getElementById('scanProgress'),
  totalFiles: document.getElementById('totalFiles'),
  totalLoc: document.getElementById('totalLoc'),
  contextList: document.getElementById('contextList'),
  metricsGrid: document.getElementById('metricsGrid'),
  fileTypesList: document.getElementById('fileTypesList'),
  complexityList: document.getElementById('complexityList'),
  largestFilesBody: document.getElementById('largestFilesBody'),
  folderStatsBody: document.getElementById('folderStatsBody'),
  issuesBody: document.getElementById('issuesBody'),
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

function renderSummary(scan) {
  const metrics = scan.metrics || {};
  const repoName = scan.repository_name || scan.repository_path || params.get('repository_url') || 'Code Analytics';
  const branch = scan.branch || params.get('branch') || '';

  elements.reportTitle.textContent = repoName;
  elements.reportSubtitle.textContent = branch ? `Branch: ${branch}` : 'Scan metrics from the browser extension.';
  elements.healthScore.textContent = Number.isFinite(Number(scan.health_score)) ? `${scan.health_score}%` : '--';
  elements.healthStatus.textContent = scan.health_status || 'Not scored';
  elements.scanStatus.textContent = scan.status || '--';
  elements.scanProgress.textContent = `${Math.round(Number(scan.progress) || 0)}%`;
  elements.totalFiles.textContent = formatNumber(metrics.total_files);
  elements.totalLoc.textContent = formatNumber(metrics.code_lines || metrics.total_lines_of_code);
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

function renderMetrics(metrics = {}) {
  elements.metricsGrid.replaceChildren();
  const nestedMetricKeys = new Set([
    'file_types',
    'largest_files',
    'folder_statistics',
    'complexity_metrics'
  ]);

  Object.entries(metrics).filter(([key]) => !nestedMetricKeys.has(key)).forEach(([key, value]) => {
    const tile = document.createElement('article');
    const label = document.createElement('span');
    const detail = document.createElement('strong');
    tile.className = 'metric-tile';
    label.textContent = formatLabel(key);
    detail.textContent = formatValue(value);
    tile.append(label, detail);
    elements.metricsGrid.append(tile);
  });

  if (!Object.keys(metrics).length) {
    const empty = document.createElement('p');
    empty.className = 'empty-row';
    empty.textContent = 'No metrics are available for this scan.';
    elements.metricsGrid.append(empty);
  }
}

function renderFileTypes(fileTypes = {}) {
  elements.fileTypesList.replaceChildren();
  const entries = Object.entries(fileTypes).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-row';
    empty.textContent = 'No file type metrics are available.';
    elements.fileTypesList.append(empty);
    return;
  }

  entries.forEach(([type, count]) => {
    const row = document.createElement('div');
    const label = document.createElement('span');
    const value = document.createElement('strong');
    row.className = 'key-value-row';
    label.textContent = type || 'No extension';
    value.textContent = formatNumber(count);
    row.append(label, value);
    elements.fileTypesList.append(row);
  });
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
  elements.largestFilesBody.replaceChildren();

  if (!files.length) {
    appendEmptyRow(elements.largestFilesBody, 6, 'No file metrics are available.');
    return;
  }

  files.forEach((file) => {
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
  });
}

function renderFolderStatistics(folders = []) {
  elements.folderStatsBody.replaceChildren();

  if (!folders.length) {
    appendEmptyRow(elements.folderStatsBody, 5, 'No folder statistics are available.');
    return;
  }

  folders.forEach((folder) => {
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
  });
}

function renderIssues(issues = []) {
  elements.issuesBody.replaceChildren();

  if (!issues.length) {
    appendEmptyRow(elements.issuesBody, 5, 'No quality issues detected.');
    return;
  }

  issues.forEach((issue) => {
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
  });
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
  [
    ['Has package.json', summary.has_package_json],
    ['Dependencies', summary.dependencies],
    ['Dev Dependencies', summary.dev_dependencies],
    ['Possibly Unused', summary.possibly_unused],
    ['Total Dependencies', summary.total_dependencies],
    ['Total Dev Dependencies', summary.total_dev_dependencies]
  ].forEach(([label, value]) => appendDefinition(elements.dependencyList, label, value));
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
  elements.aiConfidenceNote.textContent = summary.confidence_note || 'This summary is based on static scan signals.';
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
  const metrics = scan.metrics || {};
  renderSummary(scan);
  renderContext(scan);
  renderMetrics(metrics);
  renderFileTypes(metrics.file_types || {});
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
    elements.reportSubtitle.textContent = 'No scan id was provided.';
    return;
  }

  try {
    const settings = await loadSettings();
    const scan = await apiFetch(settings.apiBaseUrl, `/basic-scans/${encodeURIComponent(scanId)}`);
    currentScanId = scanId;
    renderReport(scan);
    renderAISummaryIdle();
  } catch (error) {
    showMessage('Unable to load report', error.message);
    elements.reportSubtitle.textContent = 'The extension report could not load scan metrics.';
    renderAISummaryError('Load the scan report first, then the AI summary can be requested.');
  }
}

elements.aiSummaryButton.addEventListener('click', handleAISummaryClick);
renderAISummaryIdle();
initializeReport();
