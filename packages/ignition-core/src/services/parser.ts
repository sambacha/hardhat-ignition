import { parseSolFiles } from './utils/files';

export default class Parser {
  private readonly sourcePath: string;

  constructor(sourcePath: string) {
    this.sourcePath = sourcePath;
  }

  parseSolFiles(contractNames: string[]): string[] {
    return parseSolFiles(this.sourcePath, contractNames, []);
  }
}
