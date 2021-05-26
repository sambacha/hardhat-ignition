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
import { DeploymentFileError } from "../../services/types/errors";
import { clsNamespaces } from "../../services/utils/continuation_local_storage";
import { checkIfExist } from "../../services/utils/util";
import {
  Events,
  ModuleBuilderFn,
  ModuleConfig,
  ModuleEvents,
  ModuleParams,
} from "../types";

import { Action } from "./action";
import { ContractBinding, Template } from "./contract";
import { handleModule, ModuleBuilder } from "./module_builder";

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
