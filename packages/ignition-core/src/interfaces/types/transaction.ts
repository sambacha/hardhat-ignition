import {
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/abstract-provider";

import { JsonFragmentType } from "../../services/types/artifacts/abi";

export interface TxData {
  from: string;
  input?: string;
}

export interface ContractInput {
  functionName: string;
  inputs: JsonFragmentType[];
}

export interface TransactionData {
  input: TxData | TransactionResponse;
  output?: TransactionReceipt;
}

export interface EventTransactionData {
  contractInput: ContractInput[];
  contractOutput: TransactionReceipt[];
}
