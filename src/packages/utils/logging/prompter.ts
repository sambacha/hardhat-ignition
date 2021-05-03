import cli from 'cli-ux';
import { DeniedConfirmation } from '../../types/errors';
import chalk from 'chalk';
import { generateErrorMessage, ILogging } from './index';
import { ModuleState } from '../../modules/states/module';
import { EventType } from '../../../interfaces/hardhat_ignition';

export class StreamlinedPrompter implements ILogging {
  private whitespaces: string;
  private readonly skipConfirmation: boolean;

  constructor(skipConfirmation: boolean = false) {
    this.skipConfirmation = skipConfirmation;
    this.whitespaces = '';
  }

  generatedTypes(): void {
    cli.info('Successfully generated module types, look for .d.ts file in your deployment folder.');
  }

  nothingToDeploy(): void {
    cli.info('State file is up to date and their is nothing to be deployed, if you still want to trigger deploy use --help to see how.');
    cli.exit(0);
  }

  startModuleDeploy(moduleName: string, moduleStates: ModuleState): void {
    cli.info(chalk.bold('\nDeploy module - ', chalk.green(moduleName)));
    this.whitespaces += '  ';
  }

  finishModuleDeploy(moduleName: string, summary: string): void {
    this.finishedElementExecution();
    cli.info(summary);
  }

  alreadyDeployed(elementName: string): void {
    cli.info(this.whitespaces + `${chalk.bold(elementName)} is already ${chalk.bold('deployed')}.`);
  }

  async promptContinueDeployment(): Promise<void> {
    if (this.skipConfirmation) {
      return;
    }

    const con = await cli.prompt('Do you wish to continue with deployment of this module? (Y/n)', {
      required: false
    });
    if (con == 'n') {
      throw new DeniedConfirmation('Confirmation has been declined.');
    }
  }

  async promptExecuteTx(): Promise<void> {
    if (this.skipConfirmation) {
      return;
    }

    const con = await cli.prompt('Execute transactions? (Y/n)', {
      required: false
    });
    if (con == 'n') {
      throw new DeniedConfirmation('Confirmation has been declined.');
    }
  }

  promptSignedTransaction(tx: string): void {
    cli.debug(this.whitespaces + `Signed transaction: ${tx}`);
  }

  logError(error: Error): void {
    const {
      message,
      stack,
    } = generateErrorMessage(error);

    cli.info(message);
  }

  sendingTx(): void {
    cli.action.start(this.whitespaces + 'Sending tx');
  }

  sentTx(): void {
    cli.action.stop('sent');
  }

  bindingExecution(bindingName: string): void {
    cli.info(`${this.whitespaces}${chalk.bold('Started')} deploying binding - ${chalk.bold(bindingName)}`);
    this.whitespaces += '  ';
  }

  finishedBindingExecution(bindingName: string): void {
    this.finishedElementExecution();
    cli.info(`${this.whitespaces}${chalk.bold('Finished')} binding execution - ${chalk.bold(bindingName)}\n`);
  }

  private finishedElementExecution(): void {
    this.whitespaces = this.whitespaces.slice(0, -2);
  }

  eventExecution(eventName: string): void {
    cli.info(this.whitespaces + `${chalk.bold('Started')} executing event - ${chalk.bold(eventName)}`);
    this.whitespaces += '  ';
  }

  finishedEventExecution(eventName: string, eventType: EventType): void {
    this.finishedElementExecution();
    cli.info(`${this.whitespaces}${chalk.bold('Finished')} event execution - ${chalk.bold(eventName)}\n`);
  }

  executeContractFunction(functionName: string): void {
    cli.info(this.whitespaces + `${chalk.bold('Started')} execution of contract function - `, chalk.bold(functionName));
    this.whitespaces += '  ';
  }

  finishedExecutionOfContractFunction(functionName: string): void {
    this.finishedElementExecution();
    cli.info(`${this.whitespaces}${chalk.bold('Finished')} execution of contract function - ${chalk.bold(functionName)}`);
  }

  executeWalletTransfer(from: string, to: string): void {
    cli.info(this.whitespaces + `${chalk.bold('Started')} execution of wallet transfer -  ${chalk.bold(from)} --> ${chalk.bold(to)}`);
    this.whitespaces += '  ';
  }

  finishedExecutionOfWalletTransfer(from: string, to: string): void {
    this.finishedElementExecution();
    cli.info(this.whitespaces + `${chalk.bold('Finished')} execution of wallet transfer - ${chalk.bold(from)} --> ${chalk.bold(to)}`);
  }

  transactionReceipt(): void {
    cli.info(this.whitespaces + 'Waiting for block confirmation...');
  }

  waitTransactionConfirmation(): void {
    cli.action.start(this.whitespaces + 'Block is mining');
  }

  transactionConfirmation(confirmationNumber: number): void {
    cli.action.stop(`\n${this.whitespaces} Current block confirmation: ${confirmationNumber}`);
  }

  finishedModuleUsageGeneration(moduleName: string) {
    cli.info(`Finished module usage script file generation - ${moduleName}`);
  }

  startingModuleUsageGeneration(moduleName: string) {
    cli.info(`Starting module usage script file generation - ${moduleName}`);
  }

  async parallelizationExperimental() {
    cli.warn(chalk.yellow('WARNING: This feature is experimental, please avoid using it while deploying to production'));
    const yes = await cli.confirm('Do you wish to continue with deployment of this module? (Y/n)');
    if (!yes) {
      throw new DeniedConfirmation('Confirmation has been declined.');
    }
  }

  async wrongNetwork(): Promise<boolean> {
    if (this.skipConfirmation) {
      return true;
    }

    return await cli.confirm('Contracts are missing on the network, do you wish to continue? (Y/n)');
  }

  gasPriceIsLarge(backoffTime: number) {
    cli.info(this.whitespaces + `Gas price is too large, waiting for ${backoffTime}ms before continuing`);
  }

  startModuleResolving(): void {

  }

  finishModuleResolving(): void {

  }
}
