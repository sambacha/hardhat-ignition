import React, { FC, ReactNode } from 'react';
import { render } from 'ink';
import { TerminalLayout } from './ui/layout/terminal';
import { ModuleState } from '../../../modules/states/module';
import { generateErrorMessage, ILogging } from '../index';
import { getIgnitionVersion } from '../../package_info';
import { ContractBinding, EventType, StatefulEvent } from '../../../../interfaces/hardhat_ignition';
import { FileLogging } from '../file_logging';
import { checkIfExist } from '../../util';
import chalk from 'chalk';
import { cli } from 'cli-ux';
import { ConfirmationQuestion } from './ui/layout/confirmation_question';
import { ModuleContextMissingInLogger } from '../../../types/errors';

export enum ElementStatus {
  'EMPTY' = 'EMPTY',
  'IN_PROGRESS' = 'IN_PROGRESS',
  'SUCCESSFULLY' = 'SUCCESSFULLY',
}

export type ElementWithStatus = {
  element: (ContractBinding | StatefulEvent);
  status: ElementStatus;
};

// @ts-ignore
export class OverviewLogger extends FileLogging implements ILogging {
  private readonly rerender: { [moduleName: string]: ((node: ReactNode) => void) };
  private readonly clear: { [moduleName: string]: (node: ReactNode) => void };
  private readonly cleanup: { [moduleName: string]: (node: ReactNode) => void };

  private showDeployment: boolean = false;
  private moduleState: ModuleState | undefined;
  private readonly ignitionVersion: string;
  private numberOfExecutedElements: number = 0;
  private totalNumberOfElements: number = 0;
  private moduleElements: { [key: string]: ElementWithStatus } = {};

  private moduleName: string | undefined;

  constructor() {
    super();
    this.ignitionVersion = getIgnitionVersion() || 'v0';

    this.rerender = {};
    this.clear = {};
    this.cleanup = {};
  }

  alreadyDeployed(elementName: string): void {
    super.alreadyDeployed(elementName);

    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }

    this.moduleElements[elementName].status = ElementStatus.SUCCESSFULLY;

    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);
  }

  bindingExecution(bindingName: string): void {
    super.bindingExecution(bindingName);

    this.moduleElements[bindingName].status = ElementStatus.IN_PROGRESS;
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);
  }

  logError(error: Error): void {
    super.logError(error);

    const {
      message: errorMessage,
      stack: errorStack,
    } = generateErrorMessage(error);
    this.showDeployment = false;

    if (!checkIfExist(this.moduleName)) {
      cli.info(chalk.red(errorMessage));
      if (cli.config.outputLevel == 'debug') {
        cli.info(errorStack);
      }

      return;
    }
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
      errorMessage={errorMessage}
      errorStack={errorStack}
    />);
  }

  eventExecution(eventName: string): void {
    super.eventExecution(eventName);

    this.moduleElements[eventName].status = ElementStatus.IN_PROGRESS;
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);
  }

  executeContractFunction(contractFunction: string): void {
    super.executeContractFunction(contractFunction);
  }

  executeWalletTransfer(address: string, to: string): void {
    super.executeWalletTransfer(address, to);
  }

  finishModuleDeploy(moduleName: string, summary: string): void {
    super.finishModuleDeploy(moduleName, summary);
    if (!this.rerender[moduleName] && !checkIfExist(this.rerender[moduleName])) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={summary}
    />);
  }

  finishedBindingExecution(bindingName: string): void {
    super.finishedBindingExecution(bindingName);

    this.numberOfExecutedElements += 1;
    this.moduleElements[bindingName].status = ElementStatus.SUCCESSFULLY;
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);
  }

  finishedEventExecution(eventName: string, eventType: EventType): void {
    super.finishedEventExecution(eventName, eventType);
    if (eventType == EventType.OnFail) {
      return;
    }

    this.numberOfExecutedElements += 1;
    this.moduleElements[eventName].status = ElementStatus.SUCCESSFULLY;
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);
  }

  finishedExecutionOfContractFunction(functionName: string): void {
    super.finishedExecutionOfContractFunction(functionName);
  }

  finishedExecutionOfWalletTransfer(from: string, to: string): void {
    super.finishedExecutionOfWalletTransfer(from, to);
  }

  finishedModuleUsageGeneration(moduleName: string) {
    super.finishedModuleUsageGeneration(moduleName);
  }

  gasPriceIsLarge(backoffTime: number) {
    super.gasPriceIsLarge(backoffTime);
  }

  generatedTypes(): void {
    super.generatedTypes();
  }

  nothingToDeploy(): void {
    super.nothingToDeploy();
  }

  parallelizationExperimental(): Promise<boolean> {
    return new Promise((resolve) => {
      super.parallelizationExperimental();

      render(<ConfirmationQuestion
        userPrompt={`${chalk.yellow('WARNING: This feature is experimental, please avoid using it while deploying to production')}
Confirm you are willing to continue?`}
        resolve={resolve}
      />);
    });
  }

  promptContinueDeployment(): Promise<void> {
    return Promise.resolve(undefined);
  }

  promptExecuteTx(): Promise<void> {
    return Promise.resolve(undefined);
  }

  promptSignedTransaction(tx: string): void {
    super.promptSignedTransaction(tx);
  }

  sendingTx(elementName: string, functionName: string = 'CREATE'): void {
    super.sendingTx(elementName, functionName);

    const transactionStatus = 'Sending tx...';
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={transactionStatus}
      summary={''}
    />);
  }

  sentTx(elementName: string, functionName: string = 'CREATE'): void {
    super.sentTx(elementName, functionName);

    const transactionStatus = 'Sent tx...';
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={transactionStatus}
      summary={''}
    />);
  }

  startModuleDeploy(moduleName: string, moduleStates: ModuleState): void {
    super.startModuleDeploy(moduleName, moduleStates);

    this.showDeployment = true;
    this.moduleState = moduleStates;
    this.moduleName = moduleName;
    this.moduleElements = hydrateModuleWithStatus(moduleStates);

    this.totalNumberOfElements = Object.entries(this.moduleElements).length;
    this.numberOfExecutedElements = 0;

    const {
      rerender,
      cleanup,
      clear,
    } = render(<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={''}
      summary={''}
    />);

    this.rerender[moduleName] = rerender;
    this.clear[moduleName] = clear;
    this.cleanup[this.moduleName] = cleanup;
  }

  startingModuleUsageGeneration(moduleName: string) {
    super.startingModuleUsageGeneration(moduleName);
  }

  transactionConfirmation(confirmationNumber: number, elementName: string, functionName: string = 'CREATE'): void {
    super.transactionConfirmation(confirmationNumber, elementName, functionName);

    const transactionStatus = `Waiting for block...`;
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={transactionStatus}
      summary={''}
    />);
  }

  transactionReceipt(): void {
    super.transactionReceipt();
  }

  waitTransactionConfirmation(): void {
    super.waitTransactionConfirmation();
    const transactionStatus = 'Waiting for block...';
    if (!this.moduleName) {
      throw new ModuleContextMissingInLogger();
    }
    this.rerender[this.moduleName](<TerminalLayout
      showDeployment={this.showDeployment}
      ignitionVersion={this.ignitionVersion}
      moduleName={this.moduleName}
      numberOfExecutedElements={this.numberOfExecutedElements}
      totalNumberOfElements={this.totalNumberOfElements}
      moduleElementsWithStatus={this.moduleElements}
      transactionStatus={transactionStatus}
      summary={''}
    />);
  }

  async wrongNetwork(): Promise<boolean> {
    return new Promise(resolve => {
      super.wrongNetwork();

      render(<ConfirmationQuestion
        userPrompt={'Contracts are missing on the network, do you wish to continue?'}
        resolve={resolve}
      />);
    });
  }

  startModuleResolving(moduleName: string): void {
  }

  finishModuleResolving(moduleName: string): void {
  }

  contractFunctionAlreadyExecuted(contractFunction: string, ...args: any[]): void {
  }
}

function hydrateModuleWithStatus(moduleState: ModuleState): { [key: string]: ElementWithStatus } {
  const moduleWithStatus: { [key: string]: ElementWithStatus } = {};
  for (const [key, value] of Object.entries(moduleState)) {
    moduleWithStatus[key] = {
      element: value,
      status: ElementStatus.EMPTY,
    };
  }

  return moduleWithStatus;
}