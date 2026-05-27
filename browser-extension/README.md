# Code Analytics Browser Extension

Manifest V3 prototype for Chrome and Edge. It detects a GitHub repository tab, fetches branches from the Code Analytics API, starts a scan, caches the latest scan ID per repository, and shows compact scan metrics in the popup.

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

## Load In Chrome Or Edge

1. Start the backend API at `http://localhost:8000`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select this `browser-extension` folder.
6. Visit a repository URL such as `https://github.com/owner/repo`.
7. Click the extension icon, choose a branch, and click **Analyze Repo**.

Repository root URLs, branch folder URLs, and file URLs are supported. For example, a GitHub file URL such as `/blob/main/backend/main.py` is normalized to the repository root for scanning, while the original path is preserved in the extension report link.

## Validation

Run these checks from the repository root:

```powershell
node --check browser-extension/popup.js
node --check browser-extension/options.js
node --check browser-extension/report.js
node -e "JSON.parse(require('fs').readFileSync('browser-extension/manifest.json', 'utf8')); console.log('manifest.json is valid JSON')"
```
