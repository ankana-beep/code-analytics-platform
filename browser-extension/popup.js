const DEFAULT_SETTINGS = {
  apiBaseUrl: 'http://localhost:8000/api/v1'
};

const IGNORED_GITHUB_ROOTS = new Set([
  'about',
  'apps',
  'codespaces',
  'collections',
  'customer-stories',
  'dashboard',
  'events',
  'explore',
  'features',
  'gist',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'organizations',
  'pricing',
  'pulls',
  'search',
  'settings',
  'sponsors',
  'topics',
  'trending'
]);

const REPO_ALLOWED_MODES = new Set(['tree', 'blob']);

const state = {
  settings: { ...DEFAULT_SETTINGS },
  repository: null,
  activeTabUrl: '',
  branches: [],
  selectedBranch: '',
  currentScan: null,
  busy: false
};

const elements = {
  connectionLabel: document.getElementById('connectionLabel'),
  settingsButton: document.getElementById('settingsButton'),
  messagePanel: document.getElementById('messagePanel'),
  messageTitle: document.getElementById('messageTitle'),
  messageText: document.getElementById('messageText'),
  repoName: document.getElementById('repoName'),
  branchHint: document.getElementById('branchHint'),
  branchSelect: document.getElementById('branchSelect'),
  analyzeButton: document.getElementById('analyzeButton'),
  refreshButton: document.getElementById('refreshButton'),
  openAppButton: document.getElementById('openAppButton'),
  scanStatus: document.getElementById('scanStatus'),
  progressBar: document.getElementById('progressBar'),
  progressText: document.getElementById('progressText'),
  healthScore: document.getElementById('healthScore'),
  healthStatus: document.getElementById('healthStatus'),
  totalFiles: document.getElementById('totalFiles'),
  totalLoc: document.getElementById('totalLoc'),
  totalFolders: document.getElementById('totalFolders'),
  issueCount: document.getElementById('issueCount'),
  warningCount: document.getElementById('warningCount'),
  suggestionCount: document.getElementById('suggestionCount'),
  warningsList: document.getElementById('warningsList'),
  suggestionsList: document.getElementById('suggestionsList')
};

function storageKey(repositoryUrl) {
  return `latestScan:${repositoryUrl}`;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '--';
}

function clampProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function setBusy(isBusy) {
  state.busy = isBusy;
  elements.analyzeButton.disabled = isBusy || !state.repository || state.branches.length === 0;
  elements.refreshButton.disabled = isBusy || !state.currentScan;
  elements.branchSelect.disabled = isBusy || !state.repository || state.branches.length === 0;
  elements.analyzeButton.textContent = isBusy ? 'Working...' : 'Analyze Repo';
}

function showMessage(title, text, tone = 'info') {
  elements.messageTitle.textContent = title;
  elements.messageText.textContent = text;
  elements.messagePanel.classList.toggle('error', tone === 'error');
  elements.messagePanel.hidden = false;
}

function clearMessage() {
  elements.messagePanel.hidden = true;
  elements.messageTitle.textContent = '';
  elements.messageText.textContent = '';
  elements.messagePanel.classList.remove('error');
}

function parseGitHubRepository(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.hostname !== 'github.com') {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || IGNORED_GITHUB_ROOTS.has(parts[0].toLowerCase())) {
    return null;
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo || repo.startsWith('.')) {
    return null;
  }

  let branchFromUrl = '';
  let refPathParts = [];
  if (parts.length > 2) {
    const mode = parts[2].toLowerCase();
    if (!REPO_ALLOWED_MODES.has(mode)) {
      return null;
    }
    refPathParts = parts.slice(3).map((part) => decodeURIComponent(part));
    branchFromUrl = refPathParts[0] || '';
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    branchFromUrl,
    refPathParts,
    githubPath: `${url.pathname}${url.search}${url.hash}`
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  state.settings = {
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl)
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${state.settings.apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let body = null;
  const text = await response.text();
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

async function fetchBranches() {
  const encodedUrl = encodeURIComponent(state.repository.repositoryUrl);
  const branches = await apiFetch(`/basic-scans/branches?repository_url=${encodedUrl}`);
  state.branches = Array.isArray(branches) ? branches : [];
  renderBranches();
}

function pickDefaultBranch() {
  const branchNames = state.branches.map((branch) => branch.name);
  const refPathParts = state.repository.refPathParts || [];
  const branchFromPath = branchNames
    .slice()
    .sort((a, b) => b.split('/').length - a.split('/').length)
    .find((branchName) => {
      const branchParts = branchName.split('/');
      return branchParts.every((part, index) => refPathParts[index] === part);
    });

  if (branchFromPath) {
    return branchFromPath;
  }
  if (branchNames.includes('main')) {
    return 'main';
  }
  return branchNames[0] || '';
}

function renderBranches() {
  elements.branchSelect.replaceChildren();

  if (state.branches.length === 0) {
    const option = new Option('No branches found', '');
    elements.branchSelect.append(option);
    state.selectedBranch = '';
    setBusy(state.busy);
    return;
  }

  state.branches.forEach((branch) => {
    elements.branchSelect.append(new Option(branch.name, branch.name));
  });

  state.selectedBranch = pickDefaultBranch();
  elements.branchSelect.value = state.selectedBranch;
  setBusy(state.busy);
}

async function getCachedScanId() {
  const key = storageKey(state.repository.repositoryUrl);
  const cached = await chrome.storage.local.get(key);
  return cached[key] || '';
}

async function saveCachedScan(scan) {
  const scanId = scan && (scan.id || scan._id);
  if (!scanId) {
    return;
  }
  await chrome.storage.local.set({
    [storageKey(state.repository.repositoryUrl)]: scanId
  });
}

async function fetchScanDetails(scanId) {
  const scan = await apiFetch(`/basic-scans/${encodeURIComponent(scanId)}`);
  state.currentScan = scan;
  renderScan(scan);
  return scan;
}

async function loadCachedScan() {
  const scanId = await getCachedScanId();
  if (!scanId) {
    renderEmptyScan();
    return;
  }

  try {
    await fetchScanDetails(scanId);
  } catch (error) {
    renderEmptyScan();
    showMessage('Cached scan unavailable', error.message, 'error');
  }
}

function issueSeverityClass(issue) {
  if (!issue || !issue.severity) {
    return 'info';
  }
  return ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info';
}

function compactIssueText(issue) {
  const file = issue.file ? `${issue.file}` : 'Repository';
  const line = issue.line ? `:${issue.line}` : '';
  const message = issue.message || issue.type || 'Quality signal found.';
  return `${message} (${file}${line})`;
}

function renderList(listElement, items, emptyText, className, mapper) {
  listElement.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-row';
    empty.textContent = emptyText;
    listElement.append(empty);
    return;
  }

  items.slice(0, 4).forEach((item) => {
    const row = document.createElement('li');
    row.className = typeof className === 'function' ? className(item) : className;
    row.textContent = mapper(item);
    listElement.append(row);
  });
}

function renderEmptyScan() {
  state.currentScan = null;
  elements.scanStatus.textContent = 'No scan loaded';
  elements.progressBar.style.width = '0%';
  elements.progressText.textContent = '0%';
  elements.healthScore.textContent = '--';
  elements.healthStatus.textContent = 'Waiting';
  elements.totalFiles.textContent = '--';
  elements.totalLoc.textContent = '--';
  elements.totalFolders.textContent = '--';
  elements.issueCount.textContent = '--';
  elements.warningCount.textContent = '--';
  elements.suggestionCount.textContent = '--';
  renderList(elements.warningsList, [], 'No warnings loaded.', 'empty-row', String);
  renderList(elements.suggestionsList, [], 'No suggestions loaded.', 'empty-row', String);
  setBusy(state.busy);
}

function renderScan(scan) {
  const metrics = scan.metrics || {};
  const issues = Array.isArray(scan.issues) ? scan.issues : [];
  const warnings = issues.filter((issue) => ['warning', 'error'].includes(issue.severity));
  const suggestions = Array.isArray(scan.suggestions) ? scan.suggestions : [];
  const progress = clampProgress(scan.progress);

  elements.scanStatus.textContent = scan.status || 'completed';
  elements.progressBar.style.width = `${progress}%`;
  elements.progressText.textContent = `${progress}%`;
  elements.healthScore.textContent = Number.isFinite(Number(scan.health_score)) ? `${scan.health_score}` : '--';
  elements.healthStatus.textContent = scan.health_status || 'Not scored';
  elements.totalFiles.textContent = formatNumber(metrics.total_files);
  elements.totalLoc.textContent = formatNumber(metrics.total_lines_of_code || metrics.code_lines);
  elements.totalFolders.textContent = formatNumber(metrics.total_folders);
  elements.issueCount.textContent = formatNumber(issues.length);
  elements.warningCount.textContent = formatNumber(warnings.length);
  elements.suggestionCount.textContent = formatNumber(suggestions.length);

  renderList(
    elements.warningsList,
    warnings,
    'No warnings found.',
    issueSeverityClass,
    compactIssueText
  );
  renderList(
    elements.suggestionsList,
    suggestions,
    'No suggestions found.',
    'suggestion',
    (suggestion) => suggestion
  );

  setBusy(state.busy);
}

function getCurrentScanId() {
  return state.currentScan && (state.currentScan.id || state.currentScan._id);
}

function buildExtensionReportUrl() {
  const scanId = getCurrentScanId();
  const target = new URL(chrome.runtime.getURL('report.html'));

  target.searchParams.set('source', 'extension');

  if (scanId) {
    target.searchParams.set('scan_id', scanId);
  }

  if (state.repository) {
    target.searchParams.set('repository_url', state.repository.repositoryUrl);
    target.searchParams.set('github_path', state.repository.githubPath || '');
  }

  if (state.selectedBranch) {
    target.searchParams.set('branch', state.selectedBranch);
  }

  if (state.activeTabUrl) {
    target.searchParams.set('github_url', state.activeTabUrl);
  }

  return target.toString();
}

async function analyzeRepository() {
  if (!state.repository || !state.selectedBranch) {
    return;
  }

  setBusy(true);
  clearMessage();

  try {
    const scan = await apiFetch('/basic-scans', {
      method: 'POST',
      body: JSON.stringify({
        repository_url: state.repository.repositoryUrl,
        branch: state.selectedBranch
      })
    });
    state.currentScan = scan;
    await saveCachedScan(scan);
    renderScan(scan);
    showMessage('Scan complete', 'Latest repository metrics are loaded.');
  } catch (error) {
    showMessage('Analysis failed', error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function refreshScan() {
  const scanId = state.currentScan && (state.currentScan.id || state.currentScan._id);
  if (!scanId) {
    return;
  }

  setBusy(true);
  clearMessage();
  try {
    await fetchScanDetails(scanId);
    showMessage('Scan refreshed', 'Loaded the latest saved details.');
  } catch (error) {
    showMessage('Refresh failed', error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function openApp() {
  chrome.tabs.create({ url: buildExtensionReportUrl() });
}

function renderRepository(repository) {
  elements.repoName.textContent = repository.fullName;
  elements.connectionLabel.textContent = 'Repository detected';
  elements.branchHint.textContent = repository.branchFromUrl ? `URL: ${repository.branchFromUrl}` : '';
  elements.branchHint.hidden = !repository.branchFromUrl;
}

function renderUnsupported() {
  elements.repoName.textContent = 'Open a GitHub repository';
  elements.connectionLabel.textContent = 'Waiting for repo URL';
  elements.branchHint.hidden = true;
  elements.branchSelect.replaceChildren(new Option('No repository detected', ''));
  renderEmptyScan();
  showMessage(
    'Unsupported page',
    'Visit a GitHub repository root or branch URL like https://github.com/owner/repo.',
    'error'
  );
  setBusy(false);
}

async function initializePopup() {
  setBusy(true);
  renderEmptyScan();

  try {
    await loadSettings();
    const tab = await getActiveTab();
    const repository = tab && tab.url ? parseGitHubRepository(tab.url) : null;
    state.activeTabUrl = tab && tab.url ? tab.url : '';

    if (!repository) {
      renderUnsupported();
      return;
    }

    state.repository = repository;
    renderRepository(repository);
    clearMessage();

    await Promise.allSettled([
      fetchBranches(),
      loadCachedScan()
    ]).then((results) => {
      const branchResult = results[0];
      if (branchResult.status === 'rejected') {
        elements.branchSelect.replaceChildren(new Option('Unable to load branches', ''));
        showMessage('Branch lookup failed', branchResult.reason.message, 'error');
      }
    });
  } catch (error) {
    showMessage('Extension error', error.message, 'error');
  } finally {
    setBusy(false);
  }
}

elements.branchSelect.addEventListener('change', (event) => {
  state.selectedBranch = event.target.value;
});

elements.analyzeButton.addEventListener('click', analyzeRepository);
elements.refreshButton.addEventListener('click', refreshScan);
elements.openAppButton.addEventListener('click', openApp);
elements.settingsButton.addEventListener('click', () => chrome.runtime.openOptionsPage());

initializePopup();
