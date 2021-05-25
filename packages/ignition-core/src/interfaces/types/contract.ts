import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { ElementStatus } from '../../services/types/logger';

import {
  Binding,
  ContractBinding,
  ContractBindingMetaData,
} from "../models/contract";
import { StatefulEvent } from '../models/events';

import { ModuleEvent } from "./events";

export interface Deployed {
  lastEventName: string | undefined;
  logicallyDeployed: boolean | undefined;
  contractAddress: string | undefined;
  shouldRedeploy: ShouldRedeployFn | undefined;
  deploymentSpec:
    | {
        deployFn: DeployFn | undefined;
        deps: Array<ContractBinding | ContractBindingMetaData>;
      }
    | undefined;
}

export interface EventsDepRef {
  beforeCompile: string[];
  afterCompile: string[];
  beforeDeploy: string[];
  afterDeploy: string[];
  onChange: string[];
}

export interface ModuleEvents {
  onStart: { [name: string]: ModuleEvent };
  onSuccess: { [name: string]: ModuleEvent };
  onCompletion: { [name: string]: ModuleEvent };
  onFail: { [name: string]: ModuleEvent };
}

export type DeployFn = () => Promise<DeployReturn>;

export interface DeployReturn {
  transaction: TransactionReceipt;
  contractAddress: string;
}

export type ShouldRedeployFn = (curr: ContractBinding) => boolean;

export interface FactoryCustomOpts {
  getterFunc?: string;
  getterArgs?: any[];
}

export interface Deployed {
  lastEventName: string | undefined;
  logicallyDeployed: boolean | undefined;
  contractAddress: string | undefined;
  shouldRedeploy: ShouldRedeployFn | undefined;
  deploymentSpec:
    | {
        deployFn: DeployFn | undefined;
        deps: Array<ContractBinding | ContractBindingMetaData>;
      }
    | undefined;
}

export interface SearchParams {
  functionName?: string;
}

export type AutoBinding = any | Binding | ContractBinding;

// Argument can be either an AutoBinding or a NamedArgument.
// In case of variadic arguments, the expected type is always
// an AutoBinding, and in the case of named arguments we expect
// exactly one NamedArgument.
//
// Nonetheless, the argument parsing system should account for all possible
// combinations and either intelligently process them or fail with a
// clear error and the action needed to resolve it.
export type Argument = AutoBinding | NamedArguments;

// NamedArguments are a mapping of argument names to AutoBindings
// to be used when resolving Bindings and Actions.
export interface NamedArguments {
  [name: string]: AutoBinding;
}

// Arguments is the final type that wraps the Arguments above
// and is the type that is directly used by Bindings and Actions.
export type Arguments = Argument[];
