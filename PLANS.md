## Plan

- **Goal**: Scaffold the React Native Preview VS Code extension following `docs/spec.md`, including build tooling and developer guidance for preview image capture.

### To-Do

1. Add automated tests covering extension activation, Metro lifecycle controls, and preview reload flows to prevent regressions.
2. Expand contributor-facing documentation with command usage, configuration examples, and troubleshooting tips for the preview workflow.

### Progress Log

- Initialized plan for scaffolding tasks and supporting tooling.
- Scaffolded extension structure (package.json, tsconfig.json, src/extension.ts, spec.md) and supporting tooling.
- Added preview screenshot workflow (Makefile target and Playwright Python script).
- Installed Node dev dependencies and verified TypeScript build.
- Implemented preview reload command, configurable preview URL setting, and improved Metro lifecycle handling with readiness checks and output channel logging.
- Added dependency installation to the preview screenshot workflow to avoid missing Playwright Chromium libraries in constrained environments.
- Added pre-start Metro health check reuse logic to avoid duplicate spawns and reflect running status in the status bar and logs when an existing preview is already responding.
- Added workspace folder selection for Metro start and surfaced the working directory in logs and status bar tooltips.
- Ensured Metro shuts down when the preview panel closes and updated stop flows to immediately reflect stopped status in logs and the status bar.
- Added shared disposal helper to clean up the status bar and output channel when Metro stops or the extension deactivates.
- Reviewed repository status and reran the extension build to confirm current behavior is stable.

### Decision Log

- Will include Playwright-based preview capture script invoked via Makefile to satisfy UI verification instructions.
