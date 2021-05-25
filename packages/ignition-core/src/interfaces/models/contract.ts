import { FunctionFragment } from "@ethersproject/abi";
import {
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { ContractFunction } from "@ethersproject/contracts";
import { cli } from "cli-ux";
import { Namespace } from "cls-hooked";
import { CallOverrides, ethers } from "ethers";

import { ITransactionGenerator } from "../../services/ethereum/transactions";
import { EventTxExecutor } from "../../services/ethereum/transactions/event_executor";
import { IModuleStateRepo } from "../../services/modules/states/repo";
import { JsonFragment } from "../../services/types/artifacts/abi";
import { SingleContractLinkReference } from "../../services/types/artifacts/libraries";
import {
  ArgumentLengthInvalid,
  ContractNotDeployedError,
  EventNameExistsError,
} from "../../services/types/errors";
import { clsNamespaces } from "../../services/utils/continuation_local_storage";
import { ILogging } from "../../services/utils/logging";
import {
  checkIfExist,
  checkIfSameInputs,
  copyValue,
} from "../../services/utils/util";
import {
  AfterCompileEvent,
  AfterDeployEvent,
  Arguments,
  BaseEvent,
  BeforeCompileEvent,
  BeforeDeployEvent,
  ContractEvent,
  ContractInput,
  Deployed,
  DeployFn,
  EventFn,
  EventFnCompiled,
  EventFnDeployed,
  EventsDepRef,
  EventType,
  FactoryCustomOpts,
  OnChangeEvent,
  RedeployFn,
  ShouldRedeployFn,
  TransactionData,
} from "../types";

import { ModuleBuilder } from "./module";

export abstract class Binding {
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  public deployed(m: ModuleBuilder): any {
    return {
      name: this.name,
    };
  }
}

export class ContractBinding extends Binding {
  public static generateBaseEvent(
    eventName: string,
    eventType: EventType,
    dependencies: Array<ContractBinding | ContractEvent>,
    usages: Array<ContractBinding | ContractEvent>,
    moduleSession: Namespace
  ): BaseEvent {
    const usageBindings: string[] = [];
    const eventUsages: string[] = [];

    for (const usage of usages) {
      if ((usage as ContractBinding)._isContractBinding) {
        usageBindings.push(usage.name);
      } else {
        eventUsages.push((usage as ContractEvent).name);
      }
    }

    const depBindings: string[] = [];
    const depEvents: string[] = [];
    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i];
      if ((dep as ContractBinding)._isContractBinding) {
        depBindings.push(dep.name);
      } else {
        depEvents.push((dep as ContractEvent).name);
      }
    }
    const moduleName = copyValue(moduleSession.get(clsNamespaces.MODULE_NAME));
    const subModuleNameDepth = copyValue(
      moduleSession.get(clsNamespaces.MODULE_DEPTH_NAME) || []
    );

    return {
      name: eventName,
      eventType,
      deps: depBindings,
      eventDeps: depEvents,
      usage: usageBindings,
      eventUsage: eventUsages,
      moduleName,
      subModuleNameDepth,
    };
  }

  public _isContractBinding: boolean = true;

  public contractName: string;
  public args: Arguments;
  public eventsDeps: EventsDepRef;
  public deployMetaData: Deployed;

  public moduleName: string;
  public subModuleNameDepth: string[];
  public subModule: string;

  public bytecode: string = "";
  public abi: JsonFragment[] | undefined;
  public library: boolean = false;
  public libraries: SingleContractLinkReference | undefined;

  public txData: TransactionData | undefined;
  public contractTxProgress: number | undefined;

  public forceFlag: boolean;

  public signer: ethers.Signer | undefined;
  public prompter: ILogging | undefined;
  public txGenerator: ITransactionGenerator | undefined;
  public moduleStateRepo: IModuleStateRepo | undefined;
  public eventTxExecutor: EventTxExecutor | undefined;
  public eventSession: Namespace | undefined;
  public moduleSession: Namespace;

  private contractInstance: ethers.Contract | undefined;

  constructor(
    // metadata
    name: string,
    contractName: string,
    args: Arguments,
    moduleName: string,
    subModuleNameDepth: string[],
    subModule: string,
    moduleSession: Namespace,
    bytecode?: string,
    abi?: JsonFragment[],
    libraries?: SingleContractLinkReference,
    deployMetaData?: Deployed,
    txData?: TransactionData,
    // event hooks
    events?: EventsDepRef,
    signer?: ethers.Signer,
    prompter?: ILogging,
    txGenerator?: ITransactionGenerator,
    moduleStateRepo?: IModuleStateRepo,
    eventTxExecutor?: EventTxExecutor,
    eventSession?: Namespace
  ) {
    super(name);
    this.args = args;
    this.contractName = contractName;
    this.deployMetaData = deployMetaData || {
      logicallyDeployed: undefined,
      contractAddress: undefined,
      lastEventName: undefined,
      shouldRedeploy: undefined,
      deploymentSpec: {
        deployFn: undefined,
        deps: [],
      },
    };
    this.eventsDeps = events || {
      beforeCompile: [],
      afterCompile: [],
      beforeDeploy: [],
      afterDeploy: [],
      onChange: [],
    };

    if (bytecode) {
      this.bytecode = bytecode;
    }
    this.abi = abi;
    this.libraries = libraries;

    this.txData = txData;
    this.contractTxProgress = 0;

    this.contractInstance = undefined;

    this.signer = signer;
    this.prompter = prompter;
    this.txGenerator = txGenerator;
    this.moduleStateRepo = moduleStateRepo;
    this.eventTxExecutor = eventTxExecutor;
    this.eventSession = eventSession;

    this.forceFlag = false;
    this.moduleName = moduleName;
    this.subModuleNameDepth = subModuleNameDepth;
    this.subModule = subModule;
    this.moduleSession = moduleSession;
  }

  /**
   * This is only available to be called inside event hook function execution.
   *
   * This function is instantiating wrapped ether.Contract. It has all ether.Contract functionality, as shown in
   * interface, with record keeping functionality. This is needed in case if some of underlying contract function
   * fail in execution so when hardhat-ignition continue it will "skip" successfully executed transaction.
   */
  public deployed(): ethers.Contract {
    if (this.contractInstance) {
      return this.contractInstance;
    }

    if (!checkIfSuitableForInstantiating(this)) {
      const eventName = this.eventSession?.get(clsNamespaces.EVENT_NAME) || "";
      throw new ContractNotDeployedError(
        this.name,
        this.contractName,
        eventName
      );
    }

    this.contractInstance = (new ContractInstance(
      this,
      this.deployMetaData?.contractAddress as string,
      this.abi as JsonFragment[],
      this.signer as ethers.Signer,
      this.prompter as ILogging,
      this.txGenerator as ITransactionGenerator,
      this.moduleStateRepo as IModuleStateRepo,
      this.eventTxExecutor as EventTxExecutor,
      this.eventSession as Namespace
    ) as unknown) as ethers.Contract;

    return this.contractInstance;
  }

  /**
   * Sets custom contract deployer. This means that `signer` is going to sing contract creation transaction.
   *
   * @param signer Ethers signer object referencing deployer.
   */
  public setDeployer(signer: ethers.Signer): ContractBinding {
    this.signer = signer;

    return this;
  }

  /**
   * Flag provided in case user wants to force contract deployment even if contract is already has record in state file.
   */
  public force(): ContractBinding {
    this.forceFlag = true;

    return this;
  }

  /**
   * Ability for hot-swapping contract bytecode in case of any on-fly changes by user.
   *
   * @param bytecode New contract bytecode.
   */
  public changeBytecode(bytecode: string) {
    this.bytecode = bytecode;
  }

  /**
   * This functions is setting library flag to true, in order for hardhat-ignition to know how to resolve library usage.
   */
  public setLibrary() {
    this.library = true;
  }

  /**
   * This is helper function that is setting new logic contract for proxy.
   *
   * @param m ModuleBuilder object
   * @param proxy Proxy contract deployed
   * @param logic Logic contract deployed
   * @param setLogicFuncName Function used to change logic contract in proxy
   */
  public proxySetNewLogic(
    m: ModuleBuilder,
    proxy: ContractBinding,
    logic: ContractBinding,
    setLogicFuncName: string
  ): void {
    m.group(proxy, logic).afterDeploy(
      m,
      `setNewLogicContract${proxy.name}${logic.name}`,
      async () => {
        await proxy.deployed()[setLogicFuncName](logic);
      }
    );
  }

  /**
   * Helper function for factory contracts to easily create new children contracts.
   *
   * @param m ModuleBuilder object.
   * @param childName Child contract name
   * @param createFuncName Contract creation func name in factory
   * @param args Contract creation arguments
   * @param opts Custom object that can overwrite smartly defined getterFunc and getterArgs.
   */
  public factoryCreate(
    m: ModuleBuilder,
    childName: string,
    createFuncName: string,
    args: any[],
    opts?: FactoryCustomOpts
  ): ContractBinding {
    const getFunctionName = opts?.getterFunc
      ? opts.getterFunc
      : `get${createFuncName.substr(5)}`;
    const getFunctionArgs = opts?.getterArgs ? opts.getterArgs : [];

    const child = m.contract(childName);
    child.deployFn(async () => {
      const tx = await this.deployed()[createFuncName](...args);

      const children = await this.deployed()[getFunctionName](getFunctionArgs);

      return {
        transaction: tx,
        contractAddress: children[0],
      };
    }, this);

    return child;
  }

  /**
   * Custom deploy function that
   *
   * @param deployFn
   * @param deps
   */
  public deployFn(
    deployFn: DeployFn,
    ...deps: ContractBinding[]
  ): ContractBinding {
    this.deployMetaData.deploymentSpec = {
      deployFn,
      deps,
    };

    return this;
  }

  /**
   * Before deploy event hook. It is running only if contract that event is bounded to this event is actually going to
   * be deployed.
   *
   * Event lifecycle: beforeCompile -> afterCompile -> beforeDeploy -> onChange -> afterDeploy
   * -> onCompletion -> onSuccess -> onError
   *
   * @param m ModuleBuilder object.
   * @param eventName Unique event name.
   * @param fn
   * @param usages
   */
  public beforeDeploy(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnCompiled,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    if (this.eventsDeps.beforeDeploy.includes(eventName)) {
      throw new EventNameExistsError(eventName);
    }
    this.eventsDeps.beforeDeploy.push(eventName);

    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.BeforeDeployEvent,
      [this],
      usages,
      this.moduleSession
    );

    const beforeDeployEvent: BeforeDeployEvent = {
      ...generateBaseEvent,
      fn,
    };
    m.addEvent(eventName, beforeDeployEvent);

    return beforeDeployEvent;
  }

  /**
   *  After deploy event hook. It is running only if contract that event is bounded to this event is actually going to
   *  be deployed.
   *
   * Event lifecycle: beforeCompile -> afterCompile -> beforeDeploy -> onChange -> afterDeploy
   * -> onCompletion -> onSuccess -> onError
   *
   * @param m ModuleBuilder object
   * @param eventName Unique event name
   * @param fn
   * @param usages
   */
  public afterDeploy(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnDeployed,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    if (this.eventsDeps.afterDeploy.includes(eventName)) {
      throw new EventNameExistsError(eventName);
    }
    this.eventsDeps.afterDeploy.push(eventName);

    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.AfterDeployEvent,
      [this],
      usages,
      this.moduleSession
    );

    const afterDeployEvent: AfterDeployEvent = {
      ...generateBaseEvent,
      fn,
    };
    m.addEvent(eventName, afterDeployEvent);

    return afterDeployEvent;
  }

  /**
   * This function is assigning custom ShouldRedeployFn that is returning either true or false, that is enabling for
   * hardhat-ignition to determine if this contract should be redeployed. As argument inside the ShouldRedeployFn is curr
   * parameter is contract with state file metadata for that contract. This way you can determine if their is a need
   * for contract to be redeployed.
   *
   * @param fn Function that is suggesting if contract should be redeployed.
   */
  public shouldRedeploy(fn: ShouldRedeployFn): void {
    this.deployMetaData.shouldRedeploy = fn;
  }

  /**
   *  Before compile event hook. Runs immediately before compile.
   *
   * Event lifecycle: beforeCompile -> afterCompile -> beforeDeploy -> onChange -> afterDeploy
   * -> onCompletion -> onSuccess -> onError
   *
   * @param m ModuleBuilder object.
   * @param eventName Unique event name.
   * @param fn
   * @param usages
   */
  public beforeCompile(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFn,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    if (this.eventsDeps.beforeCompile.includes(eventName)) {
      throw new EventNameExistsError(eventName);
    }
    this.eventsDeps.beforeCompile.push(eventName);

    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.BeforeCompileEvent,
      [this],
      usages,
      this.moduleSession
    );

    const beforeCompileEvent: BeforeCompileEvent = {
      ...generateBaseEvent,
      fn,
    };
    m.addEvent(eventName, beforeCompileEvent);

    return beforeCompileEvent;
  }

  /**
   *  After compile event hook. Runs immediately after compile event when bytecode, abi and other metadata is available.
   *
   * Event lifecycle: beforeCompile -> afterCompile -> beforeDeploy -> onChange -> afterDeploy
   * -> onCompletion -> onSuccess -> onError
   *
   * @param m ModuleBuilder object.
   * @param eventName Unique event name.
   * @param fn
   * @param usages
   */
  public afterCompile(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnCompiled,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    if (this.eventsDeps.afterCompile.includes(eventName)) {
      throw new EventNameExistsError(eventName);
    }
    this.eventsDeps.afterCompile.push(eventName);

    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.AfterCompileEvent,
      [this],
      usages,
      this.moduleSession
    );

    const afterCompileEvent: AfterCompileEvent = {
      ...generateBaseEvent,
      fn,
    };
    m.addEvent(eventName, afterCompileEvent);

    return afterCompileEvent;
  }

  /**
   *  On change event hook. Runs only if contract has been changed.
   *
   * Event lifecycle: beforeCompile -> afterCompile -> beforeDeploy -> onChange -> afterDeploy
   * -> onCompletion -> onSuccess -> onError
   *
   * @param m ModuleBuilder object.
   * @param eventName Unique event name.
   * @param fn
   * @param usages
   */
  public onChange(
    m: ModuleBuilder,
    eventName: string,
    fn: RedeployFn,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    if (this.eventsDeps.onChange.includes(eventName)) {
      throw new EventNameExistsError(eventName);
    }
    this.eventsDeps.onChange.push(eventName);

    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.OnChangeEvent,
      [this],
      usages,
      this.moduleSession
    );

    const onChangeEvent: OnChangeEvent = {
      ...generateBaseEvent,
      fn,
    };
    m.addEvent(eventName, onChangeEvent);

    return onChangeEvent;
  }
}

export class ContractBindingMetaData {
  public _isContractBindingMetaData: boolean = true;

  public name: string;
  public contractName: string;
  public args: Arguments;
  public bytecode: string = "";
  public abi: JsonFragment[] | undefined;
  public libraries: SingleContractLinkReference | undefined;
  public txData: TransactionData | undefined;
  public deployMetaData: Deployed;

  public library: boolean = false;

  constructor(
    name: string,
    contractName: string,
    args: Arguments,
    bytecode?: string,
    abi?: JsonFragment[],
    library?: boolean,
    libraries?: SingleContractLinkReference,
    txData?: TransactionData,
    deployMetaData?: Deployed
  ) {
    this.name = name;
    this.contractName = contractName;
    this.args = args;
    if (bytecode) {
      this.bytecode = bytecode;
    }
    this.abi = abi;
    if (library) {
      this.library = library;
    }
    this.libraries = libraries;
    this.txData = txData;
    this.deployMetaData = deployMetaData || {
      logicallyDeployed: undefined,
      contractAddress: undefined,
      lastEventName: undefined,
      shouldRedeploy: undefined,
      deploymentSpec: {
        deployFn: undefined,
        deps: [],
      },
    };
  }
}

export class Template {
  public contractName: string;

  constructor(contractName: string) {
    this.contractName = contractName;
  }
}

function checkIfSuitableForInstantiating(
  contractBinding: ContractBinding
): boolean {
  return (
    checkIfExist(contractBinding?.deployMetaData.contractAddress) &&
    checkIfExist(contractBinding?.abi) &&
    checkIfExist(contractBinding?.signer) &&
    checkIfExist(contractBinding?.prompter) &&
    checkIfExist(contractBinding?.txGenerator) &&
    checkIfExist(contractBinding?.moduleStateRepo)
  );
}

export class ContractInstance {
  [key: string]: any;

  private static _formatArgs(args: any[]): any[] {
    let i = 0;
    for (let arg of args) {
      if (
        checkIfExist(arg?.contractName) &&
        !checkIfExist(arg?.deployMetaData.contractAddress)
      ) {
        throw new ContractNotDeployedError(
          arg.name,
          arg.contractName,
          arg.moduleName
        );
      }

      if (checkIfExist(arg?.deployMetaData?.contractAddress)) {
        arg = arg as ContractBinding;

        args[i] = arg.deployMetaData.contractAddress;
      }

      i++;
    }

    return args;
  }

  private readonly contractBinding: ContractBinding;
  private readonly prompter: ILogging;
  private readonly moduleStateRepo: IModuleStateRepo;
  private readonly eventTxExecutor: EventTxExecutor;
  private readonly eventSession: Namespace;
  private readonly txGenerator: ITransactionGenerator;

  private signer: ethers.Signer;

  constructor(
    contractBinding: ContractBinding,
    contractAddress: string,
    abi: JsonFragment[],
    signer: ethers.Signer,
    prompter: ILogging,
    txGenerator: ITransactionGenerator,
    moduleStateRepo: IModuleStateRepo,
    eventTxExecutor: EventTxExecutor,
    eventSession: Namespace
  ) {
    this.prompter = prompter;
    this.txGenerator = txGenerator;
    this.contractBinding = contractBinding;
    this.eventTxExecutor = eventTxExecutor;
    this.eventSession = eventSession;
    this.signer = signer;

    if (!checkIfExist(this.contractBinding?.contractTxProgress)) {
      this.contractBinding.contractTxProgress = 0;
    }

    this.moduleStateRepo = moduleStateRepo;
    const parent: any = new ethers.Contract(contractAddress, abi, signer);

    Object.keys(parent.interface.functions).forEach((signature) => {
      const fragment = parent.interface.functions[signature];

      if (parent[signature] !== undefined) {
        if (fragment.constant) {
          this[signature] = this._buildConstantWrappers(
            parent[signature],
            fragment
          );
          this[fragment.name] = this[signature];
          return;
        }

        this[signature] = this._buildDefaultWrapper(
          parent[signature],
          fragment
        );
        this[fragment.name] = this[signature];
      }
    });

    Object.keys(parent.interface.structs).forEach((fragment) => {
      const struct = parent.interface.structs[fragment];

      if (struct !== undefined) {
        this[fragment] = this._buildStructWrappers(parent[fragment]);
        this[fragment] = this[fragment];
        return;
      }
    });

    Object.keys(parent).forEach((key) => {
      if (this[key] !== undefined) {
        return;
      }

      this[key] = parent[key];
    });
  }

  public withSigner(wallet: ethers.Wallet) {
    if (wallet._isSigner) {
      this.signer = (wallet as unknown) as ethers.Signer;
    }
  }

  private _buildDefaultWrapper(
    contractFunction: ContractFunction,
    fragment: FunctionFragment
  ): ContractFunction {
    return async (...contractArgs: any[]): Promise<TransactionResponse> => {
      const func = async function (
        this: ContractInstance,
        ...args: any[]
      ): Promise<TransactionResponse | TransactionReceipt> {
        const sessionEventName = this.eventSession.get(
          clsNamespaces.EVENT_NAME
        );

        if (
          // optional overrides
          args.length > fragment.inputs.length + 1 ||
          args.length < fragment.inputs.length
        ) {
          throw new ArgumentLengthInvalid(fragment.name, fragment.inputs);
        }

        let overrides: CallOverrides = {};
        if (args.length === fragment.inputs.length + 1) {
          overrides = args.pop() as CallOverrides;
        }

        args = ContractInstance._formatArgs(args);

        let contractTxIterator = this.contractBinding?.contractTxProgress || 0;

        const currentEventTransactionData = await this.moduleStateRepo.getEventTransactionData(
          this.contractBinding.name,
          sessionEventName
        );

        if (
          currentEventTransactionData.contractOutput.length > contractTxIterator
        ) {
          this.contractBinding.contractTxProgress = ++contractTxIterator;
          return currentEventTransactionData.contractOutput[
            contractTxIterator - 1
          ];
        }

        const currentInputs =
          currentEventTransactionData.contractInput[contractTxIterator];
        const contractOutput =
          currentEventTransactionData.contractOutput[contractTxIterator];

        if (
          checkIfExist(currentInputs) &&
          checkIfSameInputs(currentInputs, fragment.name, args) &&
          checkIfExist(contractOutput)
        ) {
          this.prompter.contractFunctionAlreadyExecuted(fragment.name, ...args);
          cli.info(
            "Contract function already executed: ",
            fragment.name,
            ...args,
            "... skipping"
          );

          this.contractBinding.contractTxProgress = ++contractTxIterator;
          return contractOutput;
        }

        if (
          (checkIfExist(currentInputs) &&
            !checkIfSameInputs(currentInputs, fragment.name, args)) ||
          !checkIfExist(currentInputs)
        ) {
          currentEventTransactionData.contractInput[contractTxIterator] = {
            functionName: fragment.name,
            inputs: args,
          } as ContractInput;
        }

        this.prompter.executeContractFunction(fragment.name);
        await this.prompter.promptExecuteTx();

        const txData = await this.txGenerator.fetchTxData(
          await this.signer.getAddress()
        );
        overrides = {
          gasPrice: overrides.gasPrice ? overrides.gasPrice : txData.gasPrice,
          value: overrides.value ? overrides.value : undefined,
          gasLimit: overrides.gasLimit ? overrides.gasLimit : undefined,
          nonce: txData.nonce,
        };

        await this.prompter.sendingTx(sessionEventName, fragment.name);
        let tx;
        try {
          tx = await contractFunction(...args, overrides);
          currentEventTransactionData.contractInput[contractTxIterator] = tx;
        } catch (err) {
          throw err;
        }
        await this.prompter.sentTx(sessionEventName, fragment.name);
        await this.moduleStateRepo.storeEventTransactionData(
          this.contractBinding.name,
          currentEventTransactionData.contractInput[contractTxIterator],
          undefined,
          sessionEventName
        );

        this.prompter.waitTransactionConfirmation();

        this.contractBinding.contractTxProgress = ++contractTxIterator;
        this.prompter.finishedExecutionOfContractFunction(fragment.name);

        return tx;
      };

      const currentEventAbstraction = this.eventSession.get(
        clsNamespaces.EVENT_NAME
      );
      const txSender = await this.signer.getAddress();
      this.eventTxExecutor.add(
        currentEventAbstraction,
        txSender,
        this.contractBinding.name,
        func
      );

      return this.eventTxExecutor.executeSingle(
        currentEventAbstraction,
        ...contractArgs
      );
    };
  }

  private _buildConstantWrappers(
    contractFunction: ContractFunction,
    fragment: FunctionFragment
  ): ContractFunction {
    return async (...args: any[]): Promise<TransactionResponse> => {
      args = ContractInstance._formatArgs(args);

      return contractFunction(...args);
    };
  }

  private _buildStructWrappers(struct: any): any {
    return async (...args: any[]): Promise<TransactionResponse> => {
      args = ContractInstance._formatArgs(args);

      return struct(...args);
    };
  }
}
