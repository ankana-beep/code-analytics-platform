# Code Analytics Browser Extension

Manifest V3 prototype for Chrome and Edge. It detects a GitHub repository tab, fetches branches from the Code Analytics API, starts a scan, caches the latest scan ID per repository, and shows compact scan metrics in the popup. Public repositories work without login, while private repositories prompt for GitHub authentication only when access is needed.

## Files

- `manifest.json` - MV3 permissions, host permissions, popup, and options page.
- `popup.html`, `popup.css`, `popup.js` - GitHub-aware scan bridge UI.
- `options.html`, `options.css`, `options.js` - configurable API URL.
- `report.html`, `report.css`, `report.js` - extension-owned full scan report page.

## Defaults

- API base URL: `http://localhost:8000/api/v1`

Settings are saved in `chrome.storage.sync`. Latest scan IDs are saved in `chrome.storage.local` using the canonical repository URL.

The **Open Report** button opens an extension-owned report page when a scan is loaded:

```text
chrome-extension://{extensionId}/report.html?source=extension&scan_id=...&repository_url=...&branch=...&github_path=...&github_url=...
```

The scan ID lets the extension report page load all stored metrics from the API, while the query parameters preserve the GitHub path and branch that came from the extension.
The extension stores the backend JWT in `chrome.storage.local` after GitHub login and sends it as a Bearer token for private repository branch lookup and scans when anonymous access is not enough.

## Load In Chrome Or Edge

1. Start the backend API at `http://localhost:8000`.
2. Start the main app at `http://localhost:5173`.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode.
5. Click **Load unpacked**.
6. Select this `browser-extension` folder.
7. Visit a repository URL such as `https://github.com/owner/repo`.
8. Click the extension icon, choose a branch, and click **Analyze Repo**.

## Validation

Run these checks from the repository root:

```powershell
node --check browser-extension/popup.js
node --check browser-extension/options.js
node --check browser-extension/report.js
node -e "JSON.parse(require('fs').readFileSync('browser-extension/manifest.json', 'utf8')); console.log('manifest.json is valid JSON')"
```
