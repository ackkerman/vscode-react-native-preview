import * as vscode from "vscode"
import { spawn, ChildProcess } from "child_process"

const DEFAULT_PREVIEW_URL = "http://localhost:19006"
const METRO_READY_TIMEOUT_MS = 30000
const METRO_READY_INTERVAL_MS = 1000
const METRO_HEALTHCHECK_TIMEOUT_MS = 3000

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

const outputChannel = vscode.window.createOutputChannel("React Native Preview")

function log(message: string) {
  const timestamp = new Date().toISOString()
  outputChannel.appendLine(`[${timestamp}] ${message}`)
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
      const response = await fetch(previewUrl)
      if (response.ok || response.status === 301 || response.status === 302 || response.status === 308) {
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), METRO_HEALTHCHECK_TIMEOUT_MS)

  try {
    const response = await fetch(previewUrl, { signal: controller.signal })
    return (
      response.ok || response.status === 301 || response.status === 302 || response.status === 308
    )
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function startMetro(previewUrl: string): Promise<void> {
  if (metroReadyPromise) {
    return metroReadyPromise
  }

  outputChannel.show(true)
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
    const spawnedProcess = spawn("npx", ["expo", "start", "--web"], {
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
      .catch((error: unknown) => {
        if (metroProcess && metroProcess !== spawnedProcess) {
          return
        }

        const message = error instanceof Error ? error.message : String(error)

        log(`Metro readiness check failed: ${message}`)
        status.text = "$(error) React Native Preview: Metro not ready"
        status.tooltip = formatStatusTooltip(previewUrl, workingDirectory)
        void vscode.window.showErrorMessage(
          "React Native Preview: Preview URL did not respond. See output for troubleshooting."
        )
        rejectMetroReady?.(
          error instanceof Error ? error : new Error("Metro readiness check failed")
        )
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

function renderPreviewHtml(previewUrl: string) {
  return `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;overflow:hidden">
        <iframe
          src="${previewUrl}"
          style="width:100vw;height:100vh;border:none"
        ></iframe>
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
  })

  return panel
}

async function showPreview(previewUrl: string) {
  const previewPanel = ensurePanel(previewUrl)
  previewPanel.webview.html = renderLoadingHtml(previewUrl)
  previewPanel.reveal()

  try {
    await startMetro(previewUrl)
    previewPanel.webview.html = renderPreviewHtml(previewUrl)
  } catch (error) {
    const reason = (error as Error).message ?? "Unknown error"
    previewPanel.webview.html = renderErrorHtml(previewUrl, reason)
  }
}

async function reloadPreview() {
  const previewUrl = validatePreviewUrl()
  if (!panel) {
    await showPreview(previewUrl)
    return
  }

  panel.webview.html = renderLoadingHtml(previewUrl)
  try {
    await startMetro(previewUrl)
    const webview = panel.webview as vscode.Webview & { reload?: () => void }
    if (typeof webview.reload === "function") {
      webview.reload()
    } else {
      panel.webview.html = renderPreviewHtml(previewUrl)
    }
    panel.reveal()
  } catch (error) {
    const reason = (error as Error).message ?? "Unknown error"
    panel.webview.html = renderErrorHtml(previewUrl, reason)
  }
}

function stopMetro(reason?: string): Promise<void> {
  const status = getStatusBarItem()
  const workingDirectory = metroWorkingDirectory

  if (!metroProcess) {
    log(`Metro stop requested but no running process was found${reason ? ` (${reason})` : ""}.`)
    status.text = "$(debug-stop) React Native Preview: Metro stopped"
    status.tooltip = "Metro is not running"
    resetMetroState()
    return Promise.resolve()
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
  return Promise.resolve()
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("rnPreview.open", async () => {
      const previewUrl = validatePreviewUrl()
      await showPreview(previewUrl)
    }),
    vscode.commands.registerCommand("rnPreview.reload", async () => {
      await reloadPreview()
    }),
    vscode.commands.registerCommand("rnPreview.restartMetro", async () => {
      await stopMetro("Restart requested")
      const previewUrl = validatePreviewUrl()
      await startMetro(previewUrl)
      void vscode.window.showInformationMessage("React Native Preview: Metro restarted")
    })
  )
}

export function deactivate() {
  void stopMetro("Extension deactivated")
}
