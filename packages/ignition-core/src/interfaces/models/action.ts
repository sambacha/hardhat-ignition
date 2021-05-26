import { ActionFn } from "../types";

export class Action {
  public name: string;
  public action: ActionFn;

  constructor(name: string, action: ActionFn) {
    this.name = name;
    this.action = action;
  }
}
