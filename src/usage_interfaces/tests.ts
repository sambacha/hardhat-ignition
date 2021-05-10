import { ConfigFlags, IIgnitionUsage } from './index';
import * as command from '../index';
import { checkIfExist } from '../services/utils/util';
import { ethers, Wallet } from 'ethers';
import { GasPriceCalculator } from '../services/ethereum/gas/calculator';
import { EthTxGenerator } from '../services/ethereum/transactions/generator';
import { ModuleStateRepo } from '../services/modules/states/state_repo';
import { ModuleResolver } from '../services/modules/module_resolver';
import { EventHandler } from '../services/modules/events/handler';
import { TxExecutor } from '../services/ethereum/transactions/executor';
import { HardhatIgnitionConfig } from '../services/types/config';
import MemoryConfigService from '../services/config/memory_service';
import { IConfigService } from '../services/config';
import { IGasProvider } from '../services/ethereum/gas';
import { ModuleStateFile } from '../services/modules/states/module';
import { TransactionManager } from '../services/ethereum/transactions/manager';
import { EventTxExecutor } from '../services/ethereum/transactions/event_executor';
import { WalletWrapper } from '../services/ethereum/wallet/wrapper';
import * as cls from 'cls-hooked';
import { Namespace } from 'cls-hooked';
import { EmptyPrompter } from '../services/utils/logging/empty_logging';
import { ILogging } from '../services/utils/logging';
import { EthClient } from '../services/ethereum/client';
import { ModuleDeploymentSummaryService } from '../services/modules/module_deployment_summary';
import { IAnalyticsService } from '../services/utils/analytics';
import { EmptyAnalyticsService } from '../services/utils/analytics/empty_analytics_service';

export class IgnitionTests implements IIgnitionUsage {
  public configFlags: ConfigFlags;
  public configFile: HardhatIgnitionConfig;

  public states: string[];
  public provider: ethers.providers.JsonRpcProvider;
  public prompter: ILogging;
  public configService: IConfigService;
  public gasProvider: IGasProvider;
  public txGenerator: EthTxGenerator;
  public moduleStateRepo: ModuleStateRepo;
  public moduleResolver: ModuleResolver;
  public eventHandler: EventHandler;
  public txExecutor: TxExecutor;
  public transactionManager: TransactionManager;
  public eventTxExecutor: EventTxExecutor;
  public eventSession: Namespace;
  public walletWrapper: WalletWrapper;
  public moduleDeploymentSummaryService: ModuleDeploymentSummaryService;
  public analyticsService: IAnalyticsService;

  constructor(configFlags: ConfigFlags, configFile: HardhatIgnitionConfig) {
    process.env.IGNITION_NETWORK_ID = String(configFlags.networkId || '31337');
    this.states = configFlags.stateFileNames;

    this.provider = new ethers.providers.JsonRpcProvider();
    if (checkIfExist(configFlags.rpcProvider)) {
      this.provider = new ethers.providers.JsonRpcProvider(configFlags.rpcProvider);
    }

    process.env.IGNITION_RPC_PROVIDER = String(configFlags.rpcProvider || 'http://localhost:8545');

    this.prompter = new EmptyPrompter();
    this.configService = new MemoryConfigService(configFile);

    this.gasProvider = new GasPriceCalculator(this.provider);

    this.transactionManager = new TransactionManager(this.provider, new Wallet(this.configService.getFirstPrivateKey(), this.provider), configFlags.networkId, this.gasProvider, this.gasProvider, this.prompter);
    this.txGenerator = new EthTxGenerator(this.configService, this.gasProvider, this.gasProvider, configFlags.networkId, this.provider, this.transactionManager, this.transactionManager, this.prompter);

    this.eventSession = cls.createNamespace('event');

    this.moduleStateRepo = new ModuleStateRepo(configFlags.networkName, 'test', false, true);
    this.eventTxExecutor = new EventTxExecutor(this.eventSession, this.moduleStateRepo);
    const ethClient = new EthClient(this.provider);
    this.moduleResolver = new ModuleResolver(this.provider, this.configService.getFirstPrivateKey(), this.prompter, this.txGenerator, this.moduleStateRepo, this.eventTxExecutor, this.eventSession, ethClient);

    this.eventHandler = new EventHandler(this.moduleStateRepo, this.prompter);
    this.txExecutor = new TxExecutor(this.prompter, this.moduleStateRepo, this.txGenerator, configFlags.networkName, this.provider, this.eventHandler, this.eventSession, this.eventTxExecutor);

    this.walletWrapper = new WalletWrapper(this.eventSession, this.transactionManager, this.gasProvider, this.gasProvider, this.moduleStateRepo, this.prompter, this.eventTxExecutor);
    this.moduleDeploymentSummaryService = new ModuleDeploymentSummaryService(this.moduleStateRepo);
    this.analyticsService = new EmptyAnalyticsService();

    this.configFile = configFile;
    this.configFlags = configFlags;
  }

  cleanup() {
    this.moduleStateRepo.clear();
  }

  async setStateFile(moduleName: string, stateFile: ModuleStateFile) {
    await this.moduleStateRepo.storeNewState(moduleName, stateFile);
  }

  async getStateFile(moduleName: string): Promise<ModuleStateFile> {
    return this.moduleStateRepo.getStateIfExist(moduleName);
  }

  async changeConfigFile(configFile: HardhatIgnitionConfig) {
    this.configFile = configFile;
  }

  async deploy(deploymentFilePath: string): Promise<void> {
    await command.deploy(
      deploymentFilePath,
      this.configFile,
      this.states,
      this.moduleStateRepo,
      this.moduleResolver,
      this.txGenerator,
      this.prompter,
      this.txExecutor,
      this.configService,
      this.walletWrapper,
      this.moduleDeploymentSummaryService,
      this.analyticsService,
      true
    );
  }

  async diff(deploymentFilePath: string): Promise<void> {
    await command.diff(
      deploymentFilePath,
      this.configFile,
      this.states,
      this.moduleResolver,
      this.moduleStateRepo,
      this.configService,
      this.analyticsService,
      true
    );
  }
}
