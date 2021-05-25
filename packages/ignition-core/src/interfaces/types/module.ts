import { ethers } from "ethers";

import { ContractBinding, ContractBindingMetaData } from "../models/contract";
import { StatefulEvent } from '../models/events';
import { ModuleBuilder } from "../models/module";

export interface ModuleParams {
  [name: string]: any;
}

export interface ModuleStateBindings {
  [name: string]: ContractBindingMetaData;
}

/**
 * Module config is simple way to specify if desired contract should be deployed or not.
 */
export interface ModuleConfig {
  contract: {
    [contractName: string]: {
      deploy: boolean;
    };
  };
  defaultOptions: ModuleOptions;
}

export interface ModuleOptions {
  // Module parameters used to customize Module behavior.
  params: { [name: string]: any };
}

export type ModuleBuilderFn = (
  m: ModuleBuilder | any,
  wallets: ethers.Signer[]
) => Promise<void>;

export interface ModuleState {
  [p: string]: ContractBinding | StatefulEvent;
}

export interface ModuleStateFile {
  [p: string]: ContractBindingMetaData | StatefulEvent;
}

export interface ModuleBindings {
  [name: string]: ContractBinding;
}
