import { ContractBinding } from "../../interfaces/models/contract";
import { StatefulEvent } from "../../interfaces/models/events";

export enum ElementStatus {
  "EMPTY" = "EMPTY",
  "IN_PROGRESS" = "IN_PROGRESS",
  "SUCCESSFULLY" = "SUCCESSFULLY",
}

// @TODO move this also?
export interface ElementWithStatus {
  element: ContractBinding | StatefulEvent;
  status: ElementStatus;
}
