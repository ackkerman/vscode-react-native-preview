import * as path from "path"
import { runTests } from "@vscode/test-electron"

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../")
    const extensionTestsPath = path.resolve(__dirname, "./suite/index")
    const workspacePath = path.resolve(extensionDevelopmentPath, "test-fixtures/metro")

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath],
      extensionTestsEnv: {
        VSCODE_CLI: "",
        ELECTRON_RUN_AS_NODE: ""
      }
    })
  } catch (error) {
    console.error("Failed to run VS Code tests.", error)
    process.exit(1)
  }
}

void main()
