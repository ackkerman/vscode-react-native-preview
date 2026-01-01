import { EventEmitter } from "events"
import { PassThrough } from "stream"
import * as childProcess from "child_process"
import * as http from "http"
import * as https from "https"
import { expect } from "chai"
import * as sinon from "sinon"
import * as vscode from "vscode"

type FakeProcess = childProcess.ChildProcess & {
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  kill: sinon.SinonStub
}

function createFakeProcess(sandbox: sinon.SinonSandbox): FakeProcess {
  const processEmitter = new EventEmitter() as FakeProcess
  processEmitter.stdout = new PassThrough()
  processEmitter.stderr = new PassThrough()
  processEmitter.kill = sandbox.stub().returns(true)
  return processEmitter
}

function stubSpawn(sandbox: sinon.SinonSandbox) {
  const processes: FakeProcess[] = []
  const stub = sandbox.stub(childProcess, "spawn").callsFake((() => {
    const proc = createFakeProcess(sandbox)
    processes.push(proc)
    return proc
  }) as typeof childProcess.spawn)
  return { stub, processes }
}

function stubRequestSequence(sandbox: sinon.SinonSandbox, statuses: number[]) {
  let callIndex = 0
  const handler = ((_: unknown, callback: (response: http.IncomingMessage) => void) => {
    const status = statuses[Math.min(callIndex, statuses.length - 1)]
    callIndex += 1

    const response = new PassThrough() as unknown as http.IncomingMessage
    response.statusCode = status

    const request = new EventEmitter() as http.ClientRequest
    request.destroy = (error?: Error) => {
      if (error) {
        request.emit("error", error)
      }
      return request
    }

    process.nextTick(() => {
      callback(response)
    })

    return request
  }) as typeof http.get

  const httpStub = sandbox.stub(http, "get").callsFake(handler)
  const httpsStub = sandbox.stub(https, "get").callsFake(handler)

  return { httpStub, httpsStub }
}

suite("React Native Preview コマンド", () => {
  const sandbox = sinon.createSandbox()

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors")
    sandbox.restore()
  })

  test("open はヘルスチェック失敗後に Metro を起動する", async () => {
    const { stub: spawnStub } = stubSpawn(sandbox)
    const { httpStub } = stubRequestSequence(sandbox, [503, 200])

    await vscode.commands.executeCommand("rnPreview.open")

    expect(spawnStub.callCount).to.equal(1)
    expect(httpStub.callCount).to.be.at.least(2)
  })

  test("open はプレビュー応答済みなら Metro を再利用する", async () => {
    const { stub: spawnStub } = stubSpawn(sandbox)
    const { httpStub } = stubRequestSequence(sandbox, [200])

    await vscode.commands.executeCommand("rnPreview.open")

    expect(spawnStub.notCalled).to.equal(true)
    expect(httpStub.callCount).to.be.at.least(1)
  })

  test("restart は Metro を停止して再起動する", async () => {
    const { stub: spawnStub, processes } = stubSpawn(sandbox)
    const { httpStub } = stubRequestSequence(sandbox, [503, 200, 503, 200])

    await vscode.commands.executeCommand("rnPreview.open")
    await vscode.commands.executeCommand("rnPreview.restartMetro")

    expect(spawnStub.callCount).to.equal(2)
    expect(processes[0].kill.called).to.equal(true)
    expect(httpStub.callCount).to.be.at.least(4)
  })
})
