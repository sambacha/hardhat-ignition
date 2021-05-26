import { Event, EventTransactionData } from "../types";

export class StatefulEvent {
  public _isStatefulEvent: boolean = true;

  public event: Event;
  public moduleName: string | undefined;
  public executed: boolean;
  public txData: { [bindingName: string]: EventTransactionData };

  constructor(
    event: Event,
    executed: boolean,
    txData: { [bindingName: string]: EventTransactionData }
  ) {
    this.event = event;
    this.executed = executed;
    this.txData = txData;
  }
}
