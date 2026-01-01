# React Native Preview for VS Code
Version: v0.1 (MVP)

## 1. Purpose

This extension provides a **React Native UI preview inside VS Code** using
Expo + React Native Web.

It is designed for **AI-first (Codex) bio-coding workflows**:
- Humans judge UI
- Codex edits code
- The extension only previews and reloads

CLI usage and native emulators are intentionally excluded.

---

## 2. In Scope

### 2.1 UI Preview
- Render React Native UI via React Native Web
- Display inside VS Code Webview using iframe
- Target URL: Expo Web Dev Server (default: http://localhost:19006)

### 2.2 Hot Reload
- Use Metro / Expo Fast Refresh
- Reflect file changes in near real-time (< 1s)

### 2.3 Metro Process Control
- Start Metro automatically if not running
- Restart Metro via VS Code command
- Do not manage dependencies

### 2.4 Commands
- Open Preview
- Reload Preview
- Restart Metro

### 2.5 Configuration
- `rnPreview.previewUrl` (default: `http://localhost:19006`) controls the iframe target for the preview webview.

### 2.6 AI-first Design
- No code parsing
- No AST analysis
- No code generation
- The extension never edits user code

---

## 3. Out of Scope

- Native emulators (Android / iOS)
- Build, archive, or store submission
- Dependency installation
- State management integration
- Flutter support

---

## 4. Technical Assumptions

- Expo-based React Native project
- react-native-web enabled
- Metro bundler available via `npx expo start --web`

---

## 5. Architecture

VS Code Extension
  ├─ Webview (iframe)
  │    └─ Expo Web Preview
  └─ Metro Process (child_process)

The extension is intentionally dumb.
All intelligence belongs to Codex.

---

## 6. Non-goals

- Low-code / no-code editor
- Design tool replacement
- Perfect platform fidelity

---

## 7. Success Criteria (MVP)

- Preview opens inside VS Code
- Hot reload works on save
- Metro can be restarted from Command Palette
