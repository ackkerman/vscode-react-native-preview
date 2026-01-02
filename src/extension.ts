import * as vscode from "vscode"
import * as childProcess from "child_process"
import type { ChildProcess } from "child_process"
import * as http from "http"
import * as https from "https"

const DEFAULT_PREVIEW_URL = "http://localhost:19006"
const DEFAULT_PREVIEW_PORT = 19006
const METRO_READY_TIMEOUT_MS = 30000
const METRO_READY_INTERVAL_MS = 1000
const METRO_HEALTHCHECK_TIMEOUT_MS = 3000

type PreviewViewport =
  | {
      mode: "full"
    }
  | {
      mode: "device"
      label: string
      width: number
      height: number
    }

type PreviewViewportQuickPickItem = vscode.QuickPickItem & {
  viewport?: PreviewViewport
  action?: "custom"
}

const VIEWPORT_PRESETS: PreviewViewportQuickPickItem[] = [
  {
    label: "Full (window)",
    description: "Use the full webview area",
    viewport: { mode: "full" }
  },
  {
    label: "iPhone 12/13 mini (414 x 780)",
    viewport: { mode: "device", label: "iPhone 12/13 mini", width: 414, height: 780 }
  },
  {
    label: "iPhone X/XS/11 Pro (375 x 812)",
    viewport: { mode: "device", label: "iPhone X/XS/11 Pro", width: 375, height: 812 }
  },
  {
    label: "iPhone XR/11/XS Max (414 x 896)",
    viewport: { mode: "device", label: "iPhone XR/11/XS Max", width: 414, height: 896 }
  },
  {
    label: "iPhone 12/13/14 (390 x 844)",
    viewport: { mode: "device", label: "iPhone 12/13/14", width: 390, height: 844 }
  },
  {
    label: "iPhone 15/16/14-15 Pro (393 x 852)",
    viewport: { mode: "device", label: "iPhone 15/16/14-15 Pro", width: 393, height: 852 }
  },
  {
    label: "iPhone 16 Pro (402 x 874)",
    viewport: { mode: "device", label: "iPhone 16 Pro", width: 402, height: 874 }
  },
  {
    label: "iPhone 12/13 Pro Max/14 Plus (428 x 926)",
    viewport: { mode: "device", label: "iPhone 12/13 Pro Max/14 Plus", width: 428, height: 926 }
  },
  {
    label: "iPhone 15 Plus/14-15 Pro Max (430 x 932)",
    viewport: { mode: "device", label: "iPhone 15 Plus/14-15 Pro Max", width: 430, height: 932 }
  },
  {
    label: "iPhone 16 Pro Max (440 x 956)",
    viewport: { mode: "device", label: "iPhone 16 Pro Max", width: 440, height: 956 }
  },
  {
    label: "Pixel 7 (412 x 915)",
    viewport: { mode: "device", label: "Pixel 7", width: 412, height: 915 }
  },
  {
    label: "Galaxy Z Fold 5 (344 x 882)",
    viewport: { mode: "device", label: "Galaxy Z Fold 5", width: 344, height: 882 }
  },
  {
    label: "Custom size...",
    description: "Enter width and height",
    action: "custom"
  }
]

let metroProcess: ChildProcess | null = null
let metroWorkingDirectory: string | null = null
let metroReadyPromise: Promise<void> | null = null
let resolveMetroReady: (() => void) | null = null
let rejectMetroReady: ((error: Error) => void) | null = null
let metroReadySettled = false
let panel: vscode.WebviewPanel | null = null
let statusBarItem: vscode.StatusBarItem | null = null
let metroStopRequested = false
let previewHealthMonitor: NodeJS.Timeout | null = null
let previewHealthMonitorToken = 0
let previewHealthCheckInFlight = false
let outputChannel: vscode.OutputChannel | null = null
let currentPreviewUrl: string | null = null
let currentPreviewViewport: PreviewViewport = { mode: "full" }

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("React Native Preview")
  }

  return outputChannel
}

function disposeExtensionResources() {
  if (statusBarItem) {
    statusBarItem.dispose()
    statusBarItem = null
  }

  if (outputChannel) {
    outputChannel.dispose()
    outputChannel = null
  }
}

function log(message: string) {
  const timestamp = new Date().toISOString()
  const channel = getOutputChannel()
  channel.appendLine(`[${timestamp}] ${message}`)
}

function formatStatusTooltip(previewUrl: string, workingDirectory: string | null) {
  if (!workingDirectory) {
    return previewUrl
  }

  return `${previewUrl}\nWorkspace: ${workingDirectory}`
}

function getStatusBarItem(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    statusBarItem.name = "React Native Preview"
    statusBarItem.tooltip = "Metro status for React Native Preview"
    statusBarItem.text = "$(preview) React Native Preview: Idle"
    statusBarItem.show()
  }
  return statusBarItem
}

function validatePreviewUrl(): string {
  const config = vscode.workspace.getConfiguration("rnPreview")
  const configuredUrl = (config.get<string>("previewUrl") ?? DEFAULT_PREVIEW_URL).trim()

  try {
    const parsed = new URL(configuredUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Preview URL must use http or https.")
    }
    return parsed.toString()
  } catch (error) {
    const fallback = DEFAULT_PREVIEW_URL
    const message = `Invalid rnPreview.previewUrl "${configuredUrl}". Falling back to ${fallback}.`
    log(message)
    void vscode.window.showWarningMessage(message)
    return fallback
  }
}

function resolvePreviewUrlWithPort(previewUrl: string, port: number): string {
  const url = new URL(previewUrl)
  url.port = String(port)
  return url.toString()
}

async function resolvePreviewViewportForOpen(): Promise<PreviewViewport | null> {
  const selection = await vscode.window.showQuickPick(VIEWPORT_PRESETS, {
    placeHolder: "Select preview size"
  })

  if (!selection) {
    return null
  }

  if (selection.viewport) {
    return selection.viewport
  }

  if (selection.action === "custom") {
    const widthInput = await vscode.window.showInputBox({
      prompt: "Preview width in pixels",
      placeHolder: "1179"
    })
    if (widthInput === undefined) {
      return null
    }

    const heightInput = await vscode.window.showInputBox({
      prompt: "Preview height in pixels",
      placeHolder: "2556"
    })
    if (heightInput === undefined) {
      return null
    }

    const width = Number(widthInput.trim())
    const height = Number(heightInput.trim())
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 10000 ||
      height > 10000
    ) {
      const message = `Invalid size "${widthInput} x ${heightInput}". Falling back to full preview.`
      log(message)
      void vscode.window.showWarningMessage(message)
      return { mode: "full" }
    }

    return {
      mode: "device",
      label: `Custom ${width} x ${height}`,
      width,
      height
    }
  }

  return { mode: "full" }
}

async function resolvePreviewUrlForOpen(): Promise<string | null> {
  const previewUrl = validatePreviewUrl()
  const input = await vscode.window.showInputBox({
    prompt: `Preview port (default ${DEFAULT_PREVIEW_PORT})`,
    placeHolder: String(DEFAULT_PREVIEW_PORT)
  })

  if (input === undefined) {
    return null
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return resolvePreviewUrlWithPort(previewUrl, DEFAULT_PREVIEW_PORT)
  }

  const parsedPort = Number(trimmed)
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    const message = `Invalid port "${input}". Falling back to ${DEFAULT_PREVIEW_PORT}.`
    log(message)
    void vscode.window.showWarningMessage(message)
    return resolvePreviewUrlWithPort(previewUrl, DEFAULT_PREVIEW_PORT)
  }

  return resolvePreviewUrlWithPort(previewUrl, parsedPort)
}

function resetMetroState() {
  clearPreviewHealthMonitor()
  metroProcess = null
  metroWorkingDirectory = null
  metroReadyPromise = null
  resolveMetroReady = null
  rejectMetroReady = null
  metroReadySettled = false
}

function clearPreviewHealthMonitor() {
  previewHealthMonitorToken += 1
  previewHealthCheckInFlight = false
  if (previewHealthMonitor) {
    clearInterval(previewHealthMonitor)
    previewHealthMonitor = null
  }
}

type WorkspaceQuickPickItem = vscode.QuickPickItem & {
  folder: vscode.WorkspaceFolder
}

async function getMetroWorkingDirectory(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders

  if (!folders || folders.length === 0) {
    const message = "React Native Preview: No workspace folder is open. Metro requires an open folder."
    log(message)
    void vscode.window.showWarningMessage(message)
    return undefined
  }

  if (folders.length === 1) {
    return folders[0].uri.fsPath
  }

  const selection = await vscode.window.showQuickPick<WorkspaceQuickPickItem>(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder
    })),
    {
      placeHolder: "Select a workspace folder for Metro (Enter to use the first folder)",
      canPickMany: false
    }
  )

  if (!selection) {
    const message = "React Native Preview: Metro start canceled because no workspace folder was selected."
    log(message)
    void vscode.window.showWarningMessage(message)
    return undefined
  }

  return selection.folder.uri.fsPath
}

function startPreviewHealthMonitor(previewUrl: string) {
  clearPreviewHealthMonitor()
  const token = previewHealthMonitorToken

  previewHealthMonitor = setInterval(() => {
    if (previewHealthCheckInFlight || token !== previewHealthMonitorToken) {
      return
    }

    previewHealthCheckInFlight = true
    void checkPreviewHealth(previewUrl)
      .then((healthy) => {
        if (token !== previewHealthMonitorToken) {
          return
        }

        if (healthy) {
          return
        }

        log(`Preview at ${previewUrl} stopped responding. Metro will restart on next preview request.`)
        const status = getStatusBarItem()
        status.text = "$(debug-stop) React Native Preview: Metro stopped"
        status.tooltip = "Metro is not running"
        resetMetroState()
      })
      .finally(() => {
        if (token === previewHealthMonitorToken) {
          previewHealthCheckInFlight = false
        }
      })
  }, METRO_READY_INTERVAL_MS)
}

async function waitForPreviewReady(previewUrl: string): Promise<void> {
  const deadline = Date.now() + METRO_READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const statusCode = await requestPreview(previewUrl, METRO_HEALTHCHECK_TIMEOUT_MS)
      if (statusCode && isHealthyStatus(statusCode)) {
        return
      }
    } catch {
      // Ignore errors while retrying
    }
    await new Promise((resolve) => setTimeout(resolve, METRO_READY_INTERVAL_MS))
  }

  throw new Error(`Preview URL did not respond within ${METRO_READY_TIMEOUT_MS / 1000}s: ${previewUrl}`)
}

async function checkPreviewHealth(previewUrl: string): Promise<boolean> {
  try {
    const statusCode = await requestPreview(previewUrl, METRO_HEALTHCHECK_TIMEOUT_MS)
    return statusCode !== null && isHealthyStatus(statusCode)
  } catch {
    return false
  }
}

function requestPreview(previewUrl: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const url = new URL(previewUrl)
    const transport = url.protocol === "https:" ? https : http

    const request = transport.get(url, (response) => {
      clearTimeout(timeout)
      resolve(response.statusCode ?? null)
      response.resume()
    })

    const timeout = setTimeout(() => {
      request.destroy(new Error("Request timed out"))
    }, timeoutMs)

    request.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

function isHealthyStatus(statusCode: number) {
  return (statusCode >= 200 && statusCode < 300) || statusCode === 301 || statusCode === 302 || statusCode === 308
}

function startMetro(previewUrl: string): Promise<void> {
  if (metroReadyPromise) {
    return metroReadyPromise
  }

  const channel = getOutputChannel()
  channel.show(true)
  const status = getStatusBarItem()

  metroReadyPromise = (async () => {
    metroReadySettled = false

    const workingDirectory = await getMetroWorkingDirectory()
    if (!workingDirectory) {
      status.text = "$(debug-stop) React Native Preview: Metro stopped"
      status.tooltip = "Metro is not running"
      resetMetroState()
      throw new Error("Workspace folder selection is required to start Metro.")
    }

    metroWorkingDirectory = workingDirectory

    if (await checkPreviewHealth(previewUrl)) {
      metroStopRequested = false
      log(
        `Preview already responding at ${previewUrl}. Reusing existing Metro instance (cwd: ${workingDirectory}).`
      )
      status.text = "$(play) React Native Preview: Metro running"
      status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)
      startPreviewHealthMonitor(previewUrl)
      metroReadySettled = true
      return
    }

    log(`Starting Metro with \`npx expo start --web\` (cwd: ${workingDirectory})...`)
    status.text = "$(loading~spin) React Native Preview: Starting Metro"
    status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)

    metroStopRequested = false
    const spawnedProcess = childProcess.spawn("npx", ["expo", "start", "--web"], {
      shell: true,
      cwd: workingDirectory
    })
    metroProcess = spawnedProcess

    const readinessPromise = new Promise<void>((resolve, reject) => {
      resolveMetroReady = resolve
      rejectMetroReady = reject
      metroReadySettled = false
    })

    spawnedProcess.stdout?.on("data", (data: Buffer) => {
      log(data.toString().trimEnd())
    })

    spawnedProcess.stderr?.on("data", (data: Buffer) => {
      log(data.toString().trimEnd())
    })

    spawnedProcess.on("error", (error: Error) => {
      if (metroProcess !== spawnedProcess) {
        return
      }

      log(`Metro failed to start: ${error.message}`)
      status.text = "$(error) React Native Preview: Metro failed"
      status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)
      void vscode.window.showErrorMessage("React Native Preview: Metro failed to start. See output for details.")
      rejectMetroReady?.(error)
      metroReadySettled = true
      resetMetroState()
    })

    spawnedProcess.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (metroProcess && metroProcess !== spawnedProcess) {
        return
      }

      log(`Metro exited (code=${code ?? "null"}, signal=${signal ?? "null"})`)
      status.text = "$(debug-stop) React Native Preview: Metro stopped"
      status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)

      if (!metroStopRequested) {
        void vscode.window.showWarningMessage(
          "React Native Preview: Metro process exited. Check the output channel for details."
        )
      }

      if (!metroReadySettled) {
        rejectMetroReady?.(new Error("Metro exited before the preview became ready."))
        metroReadySettled = true
      }

      resetMetroState()
      disposeExtensionResources()
    })

    waitForPreviewReady(previewUrl)
      .then(() => {
        if (metroProcess && metroProcess !== spawnedProcess) {
          return
        }

        log(`Preview URL responded at ${previewUrl}`)
        status.text = "$(play) React Native Preview: Metro running"
        status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)
        startPreviewHealthMonitor(previewUrl)
        resolveMetroReady?.()
        metroReadySettled = true
      })
      .catch((error) => {
        if (metroProcess && metroProcess !== spawnedProcess) {
          return
        }

        log(`Metro readiness check failed: ${error.message}`)
        status.text = "$(error) React Native Preview: Metro not ready"
        status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)
        void vscode.window.showErrorMessage(
          "React Native Preview: Preview URL did not respond. See output for troubleshooting."
        )
        rejectMetroReady?.(error)
        metroReadySettled = true
        void stopMetro("Metro readiness check failed")
      })

    return readinessPromise
  })()

  return metroReadyPromise
}

function renderLoadingHtml(previewUrl: string) {
  return `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;font-family:Segoe UI, sans-serif;">
        <div style="padding:16px;">
          <h3 style="margin:0 0 8px 0;">React Native Preview</h3>
          <p style="margin:0 0 4px 0;">Starting Metro and waiting for ${previewUrl}...</p>
          <p style="margin:0;color:#888;">Check the React Native Preview output channel for details.</p>
        </div>
      </body>
    </html>
  `
}

function renderErrorHtml(previewUrl: string, reason: string) {
  return `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;font-family:Segoe UI, sans-serif;">
        <div style="padding:16px;">
          <h3 style="margin:0 0 8px 0;">React Native Preview</h3>
          <p style="margin:0 0 4px 0;">Unable to load preview at ${previewUrl}.</p>
          <p style="margin:0;color:#c50f1f;">${reason}</p>
          <p style="margin:8px 0 0 0;color:#888;">See the React Native Preview output channel for more information.</p>
        </div>
      </body>
    </html>
  `
}

function renderPreviewHtml(previewUrl: string, viewport: PreviewViewport) {
  if (viewport.mode === "device") {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body>
          <style>
            html,
            body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #ffffff;
            }

            #preview-root {
              position: fixed;
              inset: 0;
              display: flex;
              justify-content: center;
              background: #ffffff;
              overflow-x: hidden;
              overflow-y: auto;
              padding: 16px;
              min-width: 0;
              min-height: 0;
            }

            #frame-wrapper {
              width: ${viewport.width}px;
              height: ${viewport.height}px;
            }

            #device-frame {
              width: ${viewport.width}px;
              height: ${viewport.height}px;
              border-radius: 28px;
              overflow: hidden;
              box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
              border: 2px solid #0b0b0b;
              background: #0b1220;
              transform-origin: top left;
              will-change: transform;
            }
          </style>
          <div id="preview-root">
            <div id="frame-wrapper">
              <div id="device-frame">
                <iframe
                  src="${previewUrl}"
                  style="width:100%;height:100%;border:none;"
                ></iframe>
              </div>
            </div>
          </div>
          <script>
            const wrapper = document.getElementById("frame-wrapper");
            const root = document.getElementById("preview-root");
            const frame = document.getElementById("device-frame");
            const frameWidth = ${viewport.width};
            const frameHeight = ${viewport.height};
            const applyScale = () => {
              if (!wrapper || !root || !frame) {
                return;
              }
              const bounds = root.getBoundingClientRect();
              const availableWidth = (root.clientWidth || bounds.width) - 32;
              const availableHeight = (root.clientHeight || bounds.height) - 32;
              const scale = Math.max(availableWidth, 0) / frameWidth;
              if (!Number.isFinite(scale) || scale <= 0) {
                return;
              }
              const scaledWidth = frameWidth * scale;
              const scaledHeight = frameHeight * scale;
              wrapper.style.width = \`\${scaledWidth}px\`;
              wrapper.style.height = \`\${scaledHeight}px\`;
              frame.style.transform = \`scale(\${scale})\`;
              root.style.alignItems = scaledHeight <= availableHeight ? "center" : "flex-start";
            };
            window.addEventListener("resize", applyScale);
            if (typeof ResizeObserver !== "undefined" && root) {
              const ro = new ResizeObserver(applyScale);
              ro.observe(root);
            }
            requestAnimationFrame(() => applyScale());
            requestAnimationFrame(() => applyScale());
            setTimeout(applyScale, 0);
          </script>
        </body>
      </html>
    `
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html,
          body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #ffffff;
          }

          #preview-root {
            position: fixed;
            inset: 0;
            background: #ffffff;
          }

          iframe {
            width: 100%;
            height: 100%;
            border: 0;
          }
        </style>
      </head>
      <body>
        <div id="preview-root">
          <iframe src="${previewUrl}"></iframe>
        </div>
      </body>
    </html>
  `
}

function ensurePanel(previewUrl: string): vscode.WebviewPanel {
  if (panel) {
    return panel
  }

  panel = vscode.window.createWebviewPanel(
    "rnPreview",
    "React Native Preview",
    vscode.ViewColumn.Two,
    {
      enableScripts: true
    }
  )

  panel.webview.html = renderLoadingHtml(previewUrl)

  panel.onDidDispose(() => {
    void stopMetro("Preview panel closed")
    panel = null
    currentPreviewUrl = null
    currentPreviewViewport = { mode: "full" }
  })

  return panel
}

async function showPreview(previewUrl: string, viewport: PreviewViewport) {
  currentPreviewUrl = previewUrl
  currentPreviewViewport = viewport
  const previewPanel = ensurePanel(previewUrl)
  previewPanel.webview.html = renderLoadingHtml(previewUrl)
  previewPanel.reveal()

  try {
    await startMetro(previewUrl)
    previewPanel.webview.html = renderPreviewHtml(previewUrl, viewport)
  } catch (error) {
    const reason = (error as Error).message ?? "Unknown error"
    previewPanel.webview.html = renderErrorHtml(previewUrl, reason)
  }
}

async function reloadPreview() {
  const previewUrl = currentPreviewUrl ?? validatePreviewUrl()
  currentPreviewUrl = previewUrl
  const viewport = currentPreviewViewport
  if (!panel) {
    await showPreview(previewUrl, viewport)
    return
  }

  panel.webview.html = renderLoadingHtml(previewUrl)
  try {
    await startMetro(previewUrl)
    const webview = panel.webview as vscode.Webview & { reload?: () => void }
    if (typeof webview.reload === "function") {
      webview.reload()
    } else {
      panel.webview.html = renderPreviewHtml(previewUrl, viewport)
    }
    panel.reveal()
  } catch (error) {
    const reason = (error as Error).message ?? "Unknown error"
    panel.webview.html = renderErrorHtml(previewUrl, reason)
  }
}

async function stopMetro(reason?: string) {
  const status = getStatusBarItem()
  const workingDirectory = metroWorkingDirectory

  if (!metroProcess) {
    log(`Metro stop requested but no running process was found${reason ? ` (${reason})` : ""}.`)
    status.text = "$(debug-stop) React Native Preview: Metro stopped"
    status.tooltip = "Metro is not running"
    resetMetroState()
    disposeExtensionResources()
    return
  }

  metroStopRequested = true
  log(`Stopping Metro${reason ? `: ${reason}` : ""}`)
  status.text = "$(debug-stop) React Native Preview: Stopping Metro"
  status.tooltip = workingDirectory
    ? `Stopping Metro (workspace: ${workingDirectory})`
    : "Stopping Metro"
  if (!metroReadySettled) {
    rejectMetroReady?.(new Error("Metro stop requested."))
    metroReadySettled = true
  }
  metroProcess.kill()
  resetMetroState()
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("rnPreview.open", async () => {
      const previewUrl = await resolvePreviewUrlForOpen()
      if (!previewUrl) {
        return
      }
      const viewport = await resolvePreviewViewportForOpen()
      if (!viewport) {
        return
      }
      await showPreview(previewUrl, viewport)
    }),
    vscode.commands.registerCommand("rnPreview.reload", async () => {
      await reloadPreview()
    }),
    vscode.commands.registerCommand("rnPreview.restartMetro", async () => {
      await stopMetro("Restart requested")
      const previewUrl = currentPreviewUrl ?? validatePreviewUrl()
      currentPreviewUrl = previewUrl
      await startMetro(previewUrl)
      void vscode.window.showInformationMessage("React Native Preview: Metro restarted")
    })
  )
}

export function deactivate() {
  void stopMetro("Extension deactivated")
  disposeExtensionResources()
}
