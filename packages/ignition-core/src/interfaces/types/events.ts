import { ContractBinding, StatefulEvent } from "../models";

export type RedeployFn = (...deps: ContractBinding[]) => Promise<void>;
export type EventFnDeployed = () => Promise<void>;
export type EventFnCompiled = () => void;
export type EventFn = () => void;
export type ModuleEventFn = () => Promise<void>;

export enum EventType {
  "OnChangeEvent" = "OnChangeEvent",
  "BeforeDeployEvent" = "BeforeDeployEvent",
  "AfterDeployEvent" = "AfterDeployEvent",
  "AfterCompileEvent" = "AfterCompileEvent",
  "BeforeCompileEvent" = "BeforeCompileEvent",
  "OnStart" = "OnStart",
  "OnFail" = "OnFail",
  "OnCompletion" = "OnCompletion",
  "OnSuccess" = "OnSuccess",
  "Deploy" = "Deploy",
}

export interface BaseEvent {
  name: string;
  eventType: EventType;

  // contract dependencies
  deps: string[];
  // event dependencies
  eventDeps: string[];

  usage: string[];
  eventUsage: string[];

  // moduleMetaData
  moduleName: string;
  subModuleNameDepth: string[];
}

export interface BeforeDeployEvent extends BaseEvent {
  fn: EventFnCompiled;
}

export interface AfterDeployEvent extends BaseEvent {
  fn: EventFnDeployed;
}

export interface BeforeCompileEvent extends BaseEvent {
  fn: EventFn;
}

export interface AfterCompileEvent extends BaseEvent {
  fn: EventFnCompiled;
}

export interface OnChangeEvent extends BaseEvent {
  fn: RedeployFn;
}

export interface ModuleEvent {
  name: string;
  eventType: EventType;
  fn: ModuleEventFn;
}

export interface MetaDataEvent {
  name: string;
  eventType: EventType;
  deps?: string[];
  eventDeps?: string[];
  usage?: string[];
  eventUsage?: string[];
}

export type ContractEvent =
  | BeforeDeployEvent
  | AfterDeployEvent
  | BeforeCompileEvent
  | AfterCompileEvent
  | OnChangeEvent;

export type Event = ContractEvent | ModuleEvent | MetaDataEvent;

export interface Events {
  [name: string]: StatefulEvent;
}
