import {
  ContractBinding,
  ContractBindingMetaData,
  StatefulEvent,
} from '../../../../interfaces/hardhat_ignition';

export * from './file_system';
export * from './memory';

export type ModuleState = { [p: string]: ContractBinding | StatefulEvent };
export type ModuleStateFile = {
  [p: string]: ContractBindingMetaData | StatefulEvent;
};
export const STATE_DIR_NAME = '.hardhat-ignition';
export const STATE_NAME = 'deployed_module_state.json';

export interface IModuleState {
  getModuleState(
    networkName: string,
    moduleName: string
  ): Promise<ModuleStateFile>;
  storeStates(
    networkName: string,
    moduleName: string,
    moduleState: ModuleState | ModuleStateFile | null
  ): Promise<boolean>;
  checkIfSet(moduleName: string, networkName: string): boolean;
}

export interface IModuleStateCleanup {
  clear(): void;
}