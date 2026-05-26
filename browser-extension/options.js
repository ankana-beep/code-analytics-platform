const DEFAULT_SETTINGS = {
  apiBaseUrl: 'http://localhost:8000/api/v1',
  appUrl: 'http://localhost:5173'
};

const form = document.getElementById('settingsForm');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const appUrlInput = document.getElementById('appUrl');
const resetButton = document.getElementById('resetButton');
const statusMessage = document.getElementById('statusMessage');

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function showStatus(message) {
  statusMessage.textContent = message;
  window.setTimeout(() => {
    if (statusMessage.textContent === message) {
      statusMessage.textContent = '';
    }
  }, 2500);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  appUrlInput.value = settings.appUrl || DEFAULT_SETTINGS.appUrl;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const apiBaseUrl = normalizeUrl(apiBaseUrlInput.value);
  const appUrl = normalizeUrl(appUrlInput.value);

  await chrome.storage.sync.set({ apiBaseUrl, appUrl });
  apiBaseUrlInput.value = apiBaseUrl;
  appUrlInput.value = appUrl;
  showStatus('Settings saved.');
});

resetButton.addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await loadSettings();
  showStatus('Defaults restored.');
});

loadSettings().catch(() => {
  showStatus('Unable to load settings.');
});
