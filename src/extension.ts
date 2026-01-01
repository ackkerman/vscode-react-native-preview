import * as vscode from "vscode"
import { spawn, ChildProcess } from "child_process"

let metroProcess: ChildProcess | null = null
let panel: vscode.WebviewPanel | null = null

function startMetro() {
  if (metroProcess) return

  metroProcess = spawn("npx", ["expo", "start", "--web"], {
    stdio: "inherit",
    shell: true
  })

  metroProcess.on("exit", () => {
    metroProcess = null
  })
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("rnPreview.open", () => {
      startMetro()

      if (panel) {
        panel.reveal()
        return
      }

      panel = vscode.window.createWebviewPanel(
        "rnPreview",
        "React Native Preview",
        vscode.ViewColumn.Two,
        {
          enableScripts: true
        }
      )

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
          <body style="margin:0;overflow:hidden">
            <iframe
              src="http://localhost:19006"
              style="width:100vw;height:100vh;border:none"
            ></iframe>
          </body>
        </html>
      `

      panel.onDidDispose(() => {
        panel = null
      })
    }),

    vscode.commands.registerCommand("rnPreview.restartMetro", () => {
      if (metroProcess) {
        metroProcess.kill()
        metroProcess = null
      }
      startMetro()
      vscode.window.showInformationMessage("Metro restarted")
    })
  )
}

export function deactivate() {
  if (metroProcess) {
    metroProcess.kill()
  }
}
