# Instructions for contributors

- Scope: applies to the entire repository unless a more specific AGENTS.md is added.
- Testing: run `npm run build` after changes to verify the extension builds successfully.
- UI verification: when modifying webview-facing UI or preview behavior, generate a preview screenshot using `make preview-screenshot` (see `scripts/preview_screenshot.py` for options). Run `make preview-deps` first to install Python dependencies and Playwright Chromium (with required system libraries).
- Code style: prefer TypeScript strict defaults; avoid adding unnecessary dependencies.
