import {Config} from "../types/config"
import * as fs from 'fs';
import * as path from 'path';
import {cli} from "cli-ux";

const CONFIG_FILENAME = 'mortar-config.json'

export default class ConfigService {
  private configPath: string
  private config: Config

  constructor(dirPath: string) {
    this.configPath = path.resolve(dirPath, CONFIG_FILENAME)
    let content = ""
    try {
      content = fs.readFileSync(this.configPath, {
        encoding: 'UTF-8'
      })
      this.config = JSON.parse(content) as Config
    } catch(err) {
      this.config = {
        privateKey: ""
      }
    }
  }

  generateAndSaveConfig(privateKey: string): boolean {
    this.config = {
      privateKey: privateKey
    }

    try {
      fs.writeFileSync(this.configPath , JSON.stringify(this.config, null, 4))
    } catch (e) {
      cli.debug(e)
      cli.info("Failed to write to file.")
      return false
    }

    return true
  }

  getPrivateKey(): string {
    const content = fs.readFileSync(this.configPath, {
      encoding: 'UTF-8'
    })

    return (JSON.parse(content) as Config).privateKey
  }
}
