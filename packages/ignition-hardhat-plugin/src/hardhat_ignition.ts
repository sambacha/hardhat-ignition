import {
  DeployArgs,
  DiffArgs,
  GenTypesArgs,
  IGasProvider,
  IgnitionCore,
  IgnitionParams,
  IgnitionServices,
  INonceManager,
  ITransactionSigner,
  Module,
  ModuleParams,
} from "ignition-core";

export type Args = DeployArgs | DiffArgs | GenTypesArgs;

export interface IHardhatIgnition {
  init(logging?: boolean, test?: boolean): Promise<void>;

  deploy(
    m: Module,
    networkName: string,
    logging?: boolean,
    test?: boolean
  ): Promise<void>;

  diff(module: Module, networkName: string, logging?: boolean): Promise<void>;

  genTypes(module: Module, deploymentFolder: string): Promise<void>;
}

export interface HardhatIgnitionConfig {
  logging?: boolean;
  test?: boolean;
  gasPriceProvider?: IGasProvider;
  nonceManager?: INonceManager;
  transactionSigner?: ITransactionSigner;
  moduleParams?: { [name: string]: any };
}

export class HardhatIgnition implements IHardhatIgnition {
  private readonly _ignitionCore: IgnitionCore;

  constructor(
    params: IgnitionParams,
    services: IgnitionServices,
    moduleParams?: ModuleParams
  ) {
    this._ignitionCore = new IgnitionCore(params, services, moduleParams);
  }

  public async init(
    logging: boolean = true,
    test: boolean = true
  ): Promise<void> {
    this._ignitionCore.params.logging = logging;
    this._ignitionCore.params.test = test;
    await this._ignitionCore.mustInit(this._ignitionCore.params);
  }

  public async deploy(
    module: Module,
    networkName: string,
    logging?: boolean
  ): Promise<void> {
    await this._ignitionCore.deploy(networkName, module, logging);
  }

  public async diff(
    module: Module,
    networkName: string,
    logging?: boolean
  ): Promise<void> {
    await this._ignitionCore.diff(networkName, module, logging);
  }

  public async genTypes(
    module: Module,
    deploymentFolder: string
  ): Promise<void> {
    await this._ignitionCore.genTypes(module, deploymentFolder);
  }
}
