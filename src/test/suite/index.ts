import * as fs from "fs"
import * as path from "path"
import * as Mocha from "mocha"

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true
  })
  const testsRoot = path.resolve(__dirname)

  for (const file of fs.readdirSync(testsRoot)) {
    if (file.endsWith(".test.js")) {
      mocha.addFile(path.join(testsRoot, file))
    }
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`))
          return
        }
        resolve()
      })
    } catch (error) {
      reject(error)
    }
  })
}
