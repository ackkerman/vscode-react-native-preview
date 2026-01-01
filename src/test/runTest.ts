import * as path from "path"
import { createHash } from "crypto"
import { runTests } from "@vscode/test-electron"

type ValidateStream = typeof import("@vscode/test-electron/out/util")["validateStream"]

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscodeTestUtil = require("@vscode/test-electron/out/util") as {
  validateStream: ValidateStream
}

const originalValidateStream = vscodeTestUtil.validateStream

vscodeTestUtil.validateStream = (readable, length, sha256) => {
  if (Number.isNaN(length)) {
    return new Promise((resolve, reject) => {
      const checksum = sha256 ? createHash("sha256") : undefined

      readable.on("data", (chunk: unknown) => {
        if (!checksum) {
          return
        }

        if (typeof chunk === "string") {
          checksum.update(Buffer.from(chunk))
          return
        }

        if (chunk instanceof Buffer) {
          checksum.update(chunk)
        }
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
  const extensionDevelopmentPath = path.resolve(__dirname, "../../")
  const extensionTestsPath = path.resolve(__dirname, "./suite/index")

  try {
    await runTests({
      version: "1.85.0",
      extensionDevelopmentPath,
      extensionTestsPath
    })
  } catch (error) {
    console.error("Failed to run tests")
    if (error instanceof Error) {
      console.error(error.message)
      console.error(error.stack)
    }
    process.exit(1)
  }
}

void main()
