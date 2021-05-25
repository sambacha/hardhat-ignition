import {
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Deferrable } from "@ethersproject/properties";
import { Namespace } from "cls-hooked";
import { ethers } from "ethers";

import {
  IGasCalculator,
  IGasPriceCalculator,
} from "../../services/ethereum/gas";
import { INonceManager } from "../../services/ethereum/transactions";
import { EventTxExecutor } from "../../services/ethereum/transactions/event_executor";
import { IModuleStateRepo } from "../../services/modules/states/repo";
import {
  MissingToAddressInWalletTransferTransaction,
  WalletTransactionNotInEventError,
} from "../../services/types/errors";
import { clsNamespaces } from "../../services/utils/continuation_local_storage";
import { ILogging } from "../../services/utils/logging";
import { checkIfExist } from "../../services/utils/util";

export class IgnitionSigner {
  public _signer: ethers.Signer;

  private sessionNamespace: Namespace;
  private moduleStateRepo: IModuleStateRepo;
  private nonceManager: INonceManager;
  private gasPriceCalculator: IGasPriceCalculator;
  private gasCalculator: IGasCalculator;
  private prompter: ILogging;
  private eventTxExecutor: EventTxExecutor;

  constructor(
    signer: ethers.Signer,
    sessionNamespace: Namespace,
    nonceManager: INonceManager,
    gasPriceCalculator: IGasPriceCalculator,
    gasCalculator: IGasCalculator,
    moduleStateRepo: IModuleStateRepo,
    prompter: ILogging,
    eventTxExecutor: EventTxExecutor
  ) {
    this.sessionNamespace = sessionNamespace;
    this.nonceManager = nonceManager;
    this.gasPriceCalculator = gasPriceCalculator;
    this.gasCalculator = gasCalculator;
    this.moduleStateRepo = moduleStateRepo;
    this.prompter = prompter;
    this.eventTxExecutor = eventTxExecutor;

    this._signer = signer;
  }

  public async sendTransaction(
    transaction: Deferrable<TransactionRequest>
  ): Promise<TransactionResponse> {
    const address = await this._signer.getAddress();

    const func = async (): Promise<TransactionResponse> => {
      const toAddr = (await transaction).to as string;
      if (!toAddr) {
        throw new MissingToAddressInWalletTransferTransaction();
      }
      this.prompter.executeWalletTransfer(address, toAddr);
      const currEventName = this.sessionNamespace.get(clsNamespaces.EVENT_NAME);
      if (!checkIfExist(currEventName)) {
        throw new WalletTransactionNotInEventError();
      }

      await this.prompter.sendingTx(currEventName, "raw wallet transaction");

      let ignitionTransaction;
      try {
        ignitionTransaction = await this._populateTransactionWithIgnitionMetadata(
          transaction
        );
      } catch (err) {
        throw err;
      }

      const txResp = await this._signer.sendTransaction(ignitionTransaction);
      this.prompter.sentTx(currEventName, "raw wallet transaction");
      await this.moduleStateRepo.storeEventTransactionData(
        address,
        undefined,
        undefined,
        currEventName
      );

      await this.prompter.finishedExecutionOfWalletTransfer(address, toAddr);

      return txResp;
    };

    const currentEventName = this.sessionNamespace.get(
      clsNamespaces.EVENT_NAME
    );
    this.eventTxExecutor.add(currentEventName, address, address, func);

    return this.eventTxExecutor.executeSingle(currentEventName);
  }

  public async getAddress(): Promise<string> {
    return this._signer.getAddress();
  }

  public async signTransaction(
    transaction: Deferrable<TransactionRequest>
  ): Promise<string> {
    return this._signer.signTransaction(transaction);
  }

  private async _populateTransactionWithIgnitionMetadata(
    transaction: Deferrable<TransactionRequest>
  ): Promise<TransactionRequest> {
    const address = await this._signer.getAddress();
    if (!checkIfExist(transaction.nonce)) {
      transaction.nonce = this.nonceManager.getAndIncrementTransactionCount(
        address
      );
    }

    if (!checkIfExist(transaction.gasPrice)) {
      transaction.gasPrice = await this.gasPriceCalculator.getCurrentPrice();
    }

    if (!checkIfExist(transaction.gasPrice)) {
      const toAddr = await transaction.to;
      const data = await transaction.data;
      if (data) {
        transaction.gasLimit = await this.gasCalculator.estimateGas(
          address,
          toAddr || undefined,
          data
        );
      }
    }

    return this._signer.populateTransaction(transaction);
  }
}
