import * as path from "path"
import { createHash } from "crypto"
import { runTests, TestOptions } from "@vscode/test-electron"

type ValidateStream = (readable: NodeJS.ReadableStream, length: number, sha256?: string) => Promise<void>

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscodeTestUtil = require("@vscode/test-electron/out/util") as {
  validateStream: ValidateStream
}

const originalValidateStream = vscodeTestUtil.validateStream as ValidateStream

vscodeTestUtil.validateStream = (readable, length, sha256) => {
  if (Number.isNaN(length)) {
    return new Promise((resolve, reject) => {
      const checksum = sha256 ? createHash("sha256") : undefined
      readable.on("data", (chunk: Buffer) => {
        checksum?.update(chunk)
      })
      readable.on("error", reject)
      readable.on("end", () => {
        if (checksum) {
          const digest = checksum.digest("hex")
          if (digest !== sha256) {
            reject(new Error(`Downloaded file checksum ${digest} does not match expected checksum ${sha256}`))
            return
          }
        }
        resolve()
      })
    })
  }

  return originalValidateStream(readable, length, sha256)
}

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "../../")
    const extensionTestsPath = path.resolve(__dirname, "./suite/index")

    const options: TestOptions = {
      extensionDevelopmentPath,
      extensionTestsPath
    }

    await runTests(options)
  } catch (error) {
    console.error("Failed to run tests", error)
    process.exit(1)
  }
}

void main()
