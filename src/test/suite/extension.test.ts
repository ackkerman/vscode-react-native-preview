import * as assert from "assert"
import * as vscode from "vscode"

describe("Extension activation", () => {
  it("activates and registers preview commands", async () => {
    const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === "rn-preview")

    assert.ok(extension, "Expected the React Native Preview extension to be available")

    if (!extension) {
      return
    }

    await extension.activate()

    assert.strictEqual(extension.isActive, true, "Extension should activate without errors")

    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes("rnPreview.open"), "open command should be contributed")
    assert.ok(commands.includes("rnPreview.reload"), "reload command should be contributed")
    assert.ok(commands.includes("rnPreview.restartMetro"), "restart command should be contributed")
  })
})
