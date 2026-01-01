# Instructions for contributors

- Scope: applies to the entire repository unless a more specific AGENTS.md is added.
- Testing: run `npm run build` after changes to verify the extension builds successfully.
- UI verification: when modifying webview-facing UI or preview behavior, generate a preview screenshot using `make preview-screenshot` (see `scripts/preview_screenshot.py` for options). Install the Python dependencies from `scripts/requirements.txt` and ensure Playwright Chromium is installed.
- Code style: prefer TypeScript strict defaults; avoid adding unnecessary dependencies.
