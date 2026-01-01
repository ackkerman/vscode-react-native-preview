import * as path from "path"
import * as fs from "fs"
import * as Mocha from "mocha"

export function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    ui: "bdd"
  })

  mocha.suite.emit("pre-require", global, "global", mocha)

  const testsRoot = path.resolve(__dirname, ".")

  for (const file of fs.readdirSync(testsRoot)) {
    if (file.endsWith(".test.js")) {
      mocha.addFile(path.join(testsRoot, file))
    }
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`))
      } else {
        resolve()
      }
    })
  })
}
