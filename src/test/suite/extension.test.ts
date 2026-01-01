import * as assert from "assert"
import * as vscode from "vscode"

suite("React Native Preview Extension", () => {
  test("activates and registers commands", async () => {
    const extension = vscode.extensions.all.find((candidate) => {
      const packageJSON: unknown = candidate.packageJSON
      return (
        typeof packageJSON === "object" &&
        packageJSON !== null &&
        "name" in packageJSON &&
        (packageJSON as { name?: unknown }).name === "rn-preview"
      )
    })

    assert.ok(extension, "Extension should be available")
    await extension.activate()

    const commands = await vscode.commands.getCommands(true)
    const expectedCommands = ["rnPreview.open", "rnPreview.reload", "rnPreview.restartMetro"]

    for (const command of expectedCommands) {
      assert.ok(commands.includes(command), `Command ${command} should be registered`)
    }
  })

  test("open command can be invoked without throwing", async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("rnPreview.open")
    })
  })
})
