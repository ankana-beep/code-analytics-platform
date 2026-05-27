# Code Analytics Browser Extension

Manifest V3 prototype for Chrome and Edge. It detects a GitHub repository tab, authenticates with GitHub through the backend when needed, fetches branches from the Code Analytics API, starts a scan, caches the latest scan ID per repository, and shows compact scan metrics in the popup.

## Files

- `manifest.json` - MV3 permissions, host permissions, popup, and options page.
- `popup.html`, `popup.css`, `popup.js` - GitHub-aware scan bridge UI.
- `options.html`, `options.css`, `options.js` - configurable API and app URLs.

## Defaults

- API base URL: `http://localhost:8000/api/v1`
- App URL: `http://localhost:5173`

Settings are saved in `chrome.storage.sync`. Latest scan IDs are saved in `chrome.storage.local` using the canonical repository URL.
The extension stores the backend JWT in `chrome.storage.local` after GitHub login and sends it as a Bearer token for private repository branch lookup and scans.

## Load In Chrome Or Edge

1. Start the backend API at `http://localhost:8000`.
2. Start the main app at `http://localhost:5173`.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode.
5. Click **Load unpacked**.
6. Select this `browser-extension` folder.
7. Visit a repository URL such as `https://github.com/owner/repo`.
8. For private repositories, click **Login** in the popup and approve GitHub repository access.
9. Choose a branch and click **Analyze Repo**.

## Validation

Run these checks from the repository root:

```powershell
node --check browser-extension/popup.js
node --check browser-extension/options.js
node -e "JSON.parse(require('fs').readFileSync('browser-extension/manifest.json', 'utf8')); console.log('manifest.json is valid JSON')"
```
