import { cli } from "cli-ux";
import { Namespace } from "cls-hooked";
import { ethers } from "ethers";

import { ICompiler } from "../../services/ethereum/compiler";
import { IGasPriceCalculator } from "../../services/ethereum/gas";
import {
  INonceManager,
  ITransactionSigner,
} from "../../services/ethereum/transactions";
import { IModuleRegistryResolver } from "../../services/modules/states/registry";
import { IModuleValidator } from "../../services/modules/validator";
import { JsonFragment } from "../../services/types/artifacts/abi";
import { LinkReferences } from "../../services/types/artifacts/libraries";
import {
  BindingsConflict,
  CliError,
  DeploymentFileError,
  EventDoesntExistError,
  EventNameExistsError,
  MissingContractMetadata,
  ModuleIsAlreadyInitialized,
  TemplateNotFound,
} from "../../services/types/errors";
import { clsNamespaces } from "../../services/utils/continuation_local_storage";
import { checkIfExist, isSameBytecode } from "../../services/utils/util";
import { ActionFn } from "../types/action";
import { Arguments, ModuleEvents } from "../types/contract";
import {
  ContractEvent,
  Event,
  Events,
  EventType,
  ModuleEventFn,
} from "../types/events";
import { ModuleBuilderFn, ModuleConfig, ModuleParams } from "../types/module";

import { Action } from "./action";
import { ContractBinding, Template } from "./contract";
import { StatefulEvent } from "./events";
import { GroupedDependencies } from "./grouped_deps";

/**
 * ModuleBuilder is essential backbone in building your deployment infrastructure. It stores raw contract bindings,
 * contract event hooks, module event hooks and actions. It is surfacing interface for user interaction for specifying
 * this sub-components of the ModuleBuilder.
 */
export class ModuleBuilder {
  [key: string]: ContractBinding | Event | Action | any;

  private params: ModuleParams;
  private readonly bindings: { [name: string]: ContractBinding };
  private readonly contractEvents: Events;
  private readonly moduleEvents: ModuleEvents;
  private readonly actions: { [name: string]: Action };
  private templates: { [name: string]: Template };

  private resolver: IModuleRegistryResolver | undefined;
  private registry: IModuleRegistryResolver | undefined;
  private gasPriceProvider: IGasPriceCalculator | undefined;
  private nonceManager: INonceManager | undefined;
  private transactionSigner: ITransactionSigner | undefined;

  private readonly subModules: ModuleBuilder[];
  private readonly moduleSession: Namespace;
  private compiler: ICompiler;
  private moduleValidator: IModuleValidator;

  constructor(
    moduleSession: Namespace,
    compiler: ICompiler,
    moduleValidator: IModuleValidator,
    params?: ModuleParams
  ) {
    this.bindings = {};
    this.actions = {};
    this.templates = {};
    this.resolver = undefined;
    this.registry = undefined;
    this.contractEvents = {};
    this.moduleEvents = {
      onFail: {},
      onSuccess: {},
      onCompletion: {},
      onStart: {},
    };
    this.params = {};
    if (checkIfExist(params)) {
      this.params = params || {};
    }
    this.subModules = [];
    this.moduleSession = moduleSession;
    this.compiler = compiler;
    this.moduleValidator = moduleValidator;
  }

  /**
   * Define contract with name and his constructor arguments.
   *
   * Usage example: m.contract(name, arg1, arg2, ...)
   *
   * @param name Contract name defined in solidity file.
   * @param args Constructor arguments. In case of contract binding just provide reference.
   */
  public contract(name: string, ...args: Arguments[]): ContractBinding {
    if (checkIfExist(this.bindings[name])) {
      cli.info("Contract already bind to the module - ", name); // @TODO add typed error
      cli.exit(0);
    }

    const moduleName = this.moduleSession.get(clsNamespaces.MODULE_NAME);
    const subModuleNameDepth =
      this.moduleSession.get(clsNamespaces.MODULE_DEPTH_NAME) || [];
    const subModule = this.moduleSession.get(clsNamespaces.SUB_MODULE_NAME);
    this.bindings[name] = new ContractBinding(
      name,
      name,
      args,
      moduleName,
      subModuleNameDepth.slice(0),
      subModule,
      this.moduleSession
    );
    this[name] = this.bindings[name];
    return this.bindings[name];
  }

  /**
   * Define contract with name and his constructor arguments that is library to other contracts.
   *
   * Usage example: m.library(name, arg1, arg2, ...)
   *
   * @param name Contract name.
   * @param args Constructor arguments, if any.
   */
  public library(name: string, ...args: Arguments): ContractBinding {
    const binding = this.contract(name, ...args);
    binding.setLibrary();

    return binding;
  }

  /**
   * This grouping of contract's and event hooks in order to assign event that has multiple dependencies.
   *
   * e.g. This is useful if you want to run afterDeploy event hook for multiple contracts.
   *
   * @param dependencies
   */
  public group(
    ...dependencies: Array<ContractBinding | ContractEvent>
  ): GroupedDependencies {
    return new GroupedDependencies(dependencies, this.moduleSession);
  }

  /**
   * Contract template is the way to say to hardhat-ignition that this contract is going to be deployed multiple times.
   *
   * @param name Solidity contract name
   */
  public contractTemplate(name: string): Template {
    this.templates[name] = new Template(name);

    return this.templates[name];
  }

  /**
   * Create contract deployment for contract with `templateName` that you previously defined.
   *
   * @param name Unique "friendly" contract name
   * @param templateName Solidity contract name provided in .contractTemplate() function
   * @param args Constructor arguments.
   */
  public bindTemplate(
    name: string,
    templateName: string,
    ...args: Arguments
  ): ContractBinding {
    if (checkIfExist(this.bindings[name])) {
      throw new BindingsConflict(
        `Contract already bind to the module - ${name}`
      );
    }

    if (!checkIfExist(this.templates[templateName])) {
      throw new TemplateNotFound(
        `Template with name ${templateName} is not found in this module`
      );
    }

    const moduleName = this.moduleSession.get(clsNamespaces.MODULE_NAME);
    const subModuleNameDepth =
      this.moduleSession.get(clsNamespaces.MODULE_DEPTH_NAME) || [];
    const subModule = this.moduleSession.get(clsNamespaces.SUB_MODULE_NAME);
    this.bindings[name] = new ContractBinding(
      name,
      this.templates[templateName].contractName,
      args,
      moduleName,
      subModuleNameDepth.slice(0),
      subModule,
      this.moduleSession
    );
    this[name] = this.bindings[name];

    return this.bindings[name];
  }

  /**
   * Sets single custom module parameter.
   *
   * @param name Parameter name
   * @param value Parameter value.
   */
  public param(name: string, value: any) {
    this.params.params[name] = value;
  }

  /**
   * Fetching custom module parameter.
   *
   * @param name
   */
  public getParam(name: string): any {
    if (!checkIfExist(this.params)) {
      throw new CliError(
        "This module doesnt have params, check if you are deploying right module!"
      );
    }

    return this.params.params[name];
  }

  /**
   * Sets custom module parameters.
   *
   * @param moduleParams Module parameters.
   */
  public setParam(moduleParams: ModuleParams) {
    if (!checkIfExist(moduleParams)) {
      return;
    }

    this.params = moduleParams;

    for (const [paramName, param] of Object.entries(moduleParams)) {
      this[paramName] = param;
    }
  }

  public addEvent(eventName: string, event: Event): void {
    if (checkIfExist(this.contractEvents[eventName])) {
      throw new EventNameExistsError(eventName);
    }

    this.contractEvents[eventName] = new StatefulEvent(event, false, {});
    this[eventName] = this.contractEvents[eventName];
  }

  public getEvent(eventName: string): StatefulEvent {
    if (!checkIfExist(this.contractEvents[eventName])) {
      throw new EventDoesntExistError(eventName);
    }

    return this.contractEvents[eventName];
  }

  public getAllEvents(): Events {
    return this.contractEvents;
  }

  public getAllModuleEvents(): ModuleEvents {
    return this.moduleEvents;
  }

  /**
   * Action is best way to wrap some dynamic functionality in order to be executed in later execution.
   *
   * @param name Action name
   * @param fn User defined custom fucntion.
   */
  public registerAction(name: string, fn: ActionFn): Action {
    const action = new Action(name, fn);
    this.actions[name] = action;
    this[name] = this.actions[name];

    return action;
  }

  /**
   * Assigning sub-module. This function will share current share current module builder data (contracts and event) with
   * sub-module. On function execution it will return the context.
   *
   * @param m Module object
   * @param params Optional module options
   * @param signers Optional wallets that is going to be surfaced inside sub-module,
   *
   * @returns Module builder data from sub-module.
   */
  public async useModule(
    m: Module | Promise<Module>,
    params?: ModuleParams,
    signers: ethers.Signer[] | any[] = []
  ): Promise<ModuleBuilder> {
    const moduleParams = params ? { ...this.params, ...params } : this.params;

    if (m instanceof Promise) {
      m = await m;
    }

    let moduleBuilder: ModuleBuilder;
    if (m.isInitialized()) {
      throw new ModuleIsAlreadyInitialized();
    }

    moduleBuilder = await m.init(
      this.moduleSession,
      this.compiler,
      this.moduleValidator,
      signers,
      this,
      moduleParams
    );
    const oldDepth =
      this.moduleSession.get(clsNamespaces.MODULE_DEPTH_NAME) || [];
    if (oldDepth.length >= 1) {
      oldDepth.pop();
    }
    this.moduleSession.set(clsNamespaces.MODULE_DEPTH_NAME, oldDepth);

    const bindings = m.getAllBindings();
    const events = m.getAllEvents();

    const networkId = process.env.IGNITION_NETWORK_ID || "";
    const resolver = await m.getRegistry();

    for (const [eventName, event] of Object.entries(events)) {
      if (checkIfExist(this.contractEvents[eventName])) {
        continue;
      }

      this.addEvent(eventName, event.event);
    }

    for (const [bindingName, binding] of Object.entries(bindings)) {
      if (
        checkIfExist(this.bindings[bindingName]) &&
        this.bindings[bindingName] &&
        !isSameBytecode(this.bindings[bindingName].bytecode, binding.bytecode)
      ) {
        continue;
      }

      binding.deployMetaData.contractAddress = await resolver?.resolveContract(
        networkId,
        m.name,
        bindingName
      );
      this[bindingName] = binding;
      this.bindings[bindingName] = binding;
    }

    this.templates = m.getAllTemplates();

    return moduleBuilder;
  }

  public getAllSubModules(): ModuleBuilder[] {
    return this.subModules;
  }

  public getBinding(name: string): ContractBinding {
    return this.bindings[name];
  }

  public getAllBindings(): { [name: string]: ContractBinding } {
    return this.bindings;
  }

  public getAllActions(): { [name: string]: Action } {
    return this.actions;
  }

  public setResolver(resolver: IModuleRegistryResolver): void {
    this.resolver = resolver;
  }

  public getResolver(): IModuleRegistryResolver | undefined {
    return this.resolver;
  }

  public setRegistry(registry: IModuleRegistryResolver): void {
    this.registry = registry;
  }

  public setCustomGasPriceProvider(provider: IGasPriceCalculator): void {
    this.gasPriceProvider = provider;
  }

  public getCustomGasPriceProvider(): IGasPriceCalculator | undefined {
    return this.gasPriceProvider;
  }

  public setCustomNonceManager(nonceManager: INonceManager): void {
    this.nonceManager = nonceManager;
  }

  public getCustomNonceManager(): INonceManager | undefined {
    return this.nonceManager;
  }

  public setCustomTransactionSigner(txSigner: ITransactionSigner): void {
    this.transactionSigner = txSigner;
  }

  public getCustomTransactionSigner(): ITransactionSigner | undefined {
    return this.transactionSigner;
  }

  public getRegistry(): IModuleRegistryResolver | undefined {
    return this.registry;
  }

  public getAllTemplates(): { [name: string]: Template } {
    return this.templates;
  }

  public getAllParams(): ModuleParams {
    return this.params;
  }

  /**
   * OnStart Module event. This event is always running first, before another event in event lifecycle.
   *
   * @param eventName Unique event name
   * @param fn Module event function
   */
  public onStart(eventName: string, fn: ModuleEventFn): void {
    this.moduleEvents.onStart[eventName] = {
      name: eventName,
      eventType: EventType.OnStart,
      fn,
    };
  }

  /**
   * OnCompletion module event is run when module execution is finished, event if it has errored.
   *
   * @param eventName Unique event name
   * @param fn Module event function
   */
  public onCompletion(eventName: string, fn: ModuleEventFn): void {
    this.moduleEvents.onCompletion[eventName] = {
      name: eventName,
      eventType: EventType.OnCompletion,
      fn,
    };
  }

  /**
   * OnSuccess module event is run only if module execution is successfully finished.
   *
   * @param eventName Unique event name
   * @param fn Module event function
   */
  public onSuccess(eventName: string, fn: ModuleEventFn): void {
    this.moduleEvents.onSuccess[eventName] = {
      name: eventName,
      eventType: EventType.OnSuccess,
      fn,
    };
  }

  /**
   * OnFail module event is run only if module execution errored or failed for any other reason.
   *
   * @param eventName Unique event name
   * @param fn Module event function
   */
  public onFail(eventName: string, fn: ModuleEventFn): void {
    this.moduleEvents.onFail[eventName] = {
      name: eventName,
      eventType: EventType.OnFail,
      fn,
    };
  }
}

export class Module {
  public readonly name: string;
  private readonly isUsage: boolean = false;

  private initialized: boolean = false;
  private readonly fn: ModuleBuilderFn;
  private params: ModuleParams;
  private bindings: { [name: string]: ContractBinding };
  private events: Events;
  private moduleEvents: ModuleEvents;
  private actions: { [name: string]: Action };
  private readonly moduleConfig: ModuleConfig | undefined;
  private templates: { [name: string]: Template };

  private registry: IModuleRegistryResolver | undefined;
  private resolver: IModuleRegistryResolver | undefined;
  private gasPriceProvider: IGasPriceCalculator | undefined;
  private nonceManager: INonceManager | undefined;
  private transactionSigner: ITransactionSigner | undefined;

  constructor(
    moduleName: string,
    fn: ModuleBuilderFn,
    moduleConfig: ModuleConfig | undefined,
    usageModule: boolean = false
  ) {
    this.name = moduleName;
    this.fn = fn;
    this.moduleConfig = moduleConfig;
    this.isUsage = usageModule;

    this.params = moduleConfig?.defaultOptions?.params || {};
    this.bindings = {};
    this.events = {};
    this.moduleEvents = {
      onFail: {},
      onCompletion: {},
      onStart: {},
      onSuccess: {},
    };
    this.actions = {};
    this.templates = {};
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async init(
    moduleSession: Namespace,
    compiler: ICompiler,
    moduleValidator: IModuleValidator,
    signers: ethers.Signer[],
    m?: ModuleBuilder,
    moduleParams?: ModuleParams
  ): Promise<ModuleBuilder> {
    if (moduleParams && checkIfExist(moduleParams)) {
      this.params = moduleParams;
    }
    let moduleBuilder = m
      ? m
      : new ModuleBuilder(
          moduleSession,
          compiler,
          moduleValidator,
          moduleParams
        );
    if (moduleParams) {
      moduleBuilder.setParam(moduleParams);
    }

    // this is needed in order for ContractBindings to be aware of their originating module for later context changes
    if (!!m) {
      const currentDepth =
        moduleSession.get(clsNamespaces.MODULE_DEPTH_NAME) || [];
      currentDepth.push(this.name);

      moduleSession.set(clsNamespaces.MODULE_DEPTH_NAME, currentDepth);
    } else {
      moduleSession.set(clsNamespaces.MODULE_NAME, this.name);
    }

    try {
      await this.fn(moduleBuilder, signers);
    } catch (err) {
      if (err._isUserError || err._isCliError) {
        throw err;
      }

      throw new DeploymentFileError(err);
    }
    moduleBuilder = await handleModule(
      moduleBuilder,
      compiler,
      moduleValidator,
      this.name,
      this.isUsage,
      !!m
    );

    this.bindings = moduleBuilder.getAllBindings();
    this.events = moduleBuilder.getAllEvents();
    this.moduleEvents = moduleBuilder.getAllModuleEvents();
    this.actions = moduleBuilder.getAllActions();
    this.registry = moduleBuilder.getRegistry();
    this.resolver = moduleBuilder.getResolver();
    this.gasPriceProvider = moduleBuilder.getCustomGasPriceProvider();
    this.nonceManager = moduleBuilder.getCustomNonceManager();
    this.transactionSigner = moduleBuilder.getCustomTransactionSigner();
    this.templates = moduleBuilder.getAllTemplates();
    this.params = moduleBuilder.getAllParams();

    this.initialized = true;

    return moduleBuilder;
  }

  public getAllBindings(): { [name: string]: ContractBinding } {
    return this.bindings;
  }

  public getAllEvents(): Events {
    return this.events;
  }

  public getParams(): ModuleParams {
    return this.params;
  }

  public getAllModuleEvents(): ModuleEvents {
    return this.moduleEvents;
  }

  public getAllActions(): { [name: string]: Action } {
    return this.actions;
  }

  public getRegistry(): IModuleRegistryResolver | undefined {
    return this.registry;
  }

  public setRegistry(registry: IModuleRegistryResolver): void {
    this.registry = registry;
  }

  public getResolver(): IModuleRegistryResolver | undefined {
    return this.resolver;
  }

  public setResolver(resolver: IModuleRegistryResolver): void {
    this.resolver = resolver;
  }

  public getAction(name: string): Action {
    return this.actions[name];
  }

  public getModuleConfig(): ModuleConfig | undefined {
    return this.moduleConfig;
  }

  public getAllTemplates(): { [name: string]: Template } {
    return this.templates;
  }

  public getCustomGasPriceProvider(): IGasPriceCalculator | undefined {
    return this.gasPriceProvider;
  }

  public getCustomNonceManager(): INonceManager | undefined {
    return this.nonceManager;
  }

  public getCustomTransactionSigner(): ITransactionSigner | undefined {
    return this.transactionSigner;
  }
}

export async function handleModule(
  moduleBuilder: ModuleBuilder,
  compiler: ICompiler,
  moduleValidator: IModuleValidator,
  moduleName: string,
  isUsage: boolean,
  isSubModule: boolean
): Promise<ModuleBuilder> {
  const contractBuildNames: string[] = [];
  const moduleBuilderBindings = moduleBuilder.getAllBindings();
  for (const [, bind] of Object.entries(moduleBuilderBindings)) {
    contractBuildNames.push(bind.contractName);
  }

  const bytecodes: { [name: string]: string } = compiler.extractBytecode(
    contractBuildNames
  );
  const abi: {
    [name: string]: JsonFragment[];
  } = compiler.extractContractInterface(contractBuildNames);
  const libraries: LinkReferences = compiler.extractContractLibraries(
    contractBuildNames
  );

  if (!isUsage) {
    moduleValidator.validate(moduleBuilderBindings, abi);
  }

  for (const [bindingName, binding] of Object.entries(moduleBuilderBindings)) {
    if (
      !checkIfExist(bytecodes[binding.contractName]) ||
      !checkIfExist(libraries[binding.contractName])
    ) {
      throw new MissingContractMetadata(
        `Contract metadata are missing for ${bindingName}`
      );
    }

    moduleBuilderBindings[bindingName].bytecode =
      bytecodes[binding.contractName];
    moduleBuilderBindings[bindingName].abi = abi[binding.contractName];
    moduleBuilderBindings[bindingName].libraries =
      libraries[binding.contractName];
  }

  return moduleBuilder;
}
