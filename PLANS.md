## Plan

- **Goal**: Scaffold the React Native Preview VS Code extension following `docs/spec.md`, including build tooling and developer guidance for preview image capture.

### To-Do

1. Create project structure and configuration (package.json, tsconfig, src directory) per spec.
2. Implement minimal extension activation logic with Metro control and webview preview iframe.
3. Add developer tooling (Makefile, Python script) for preview screenshot generation and document usage in AGENTS instructions.
4. Install dependencies and ensure TypeScript build succeeds.
5. Review repository status, run tests, and prepare commit/PR content.
6. Add rnPreview.reload command wiring and expose rnPreview.previewUrl configuration so the iframe source can be customized.
7. Harden Metro lifecycle handling (status reporting, readiness checks, reload flows) to reduce blank previews and surface failures.

### Progress Log

- Initialized plan for scaffolding tasks and supporting tooling.
- Scaffolded extension structure (package.json, tsconfig.json, src/extension.ts, spec.md) and supporting tooling.
- Added preview screenshot workflow (Makefile target and Playwright Python script).
- Installed Node dev dependencies and verified TypeScript build.
- Implemented preview reload command, configurable preview URL setting, and improved Metro lifecycle handling with readiness checks and output channel logging.
- Added dependency installation to the preview screenshot workflow to avoid missing Playwright Chromium libraries in constrained environments.
- Added pre-start Metro health check reuse logic to avoid duplicate spawns and reflect running status in the status bar and logs when an existing preview is already responding.
- Added workspace folder selection for Metro start and surfaced the working directory in logs and status bar tooltips.

### Decision Log

- Will include Playwright-based preview capture script invoked via Makefile to satisfy UI verification instructions.
