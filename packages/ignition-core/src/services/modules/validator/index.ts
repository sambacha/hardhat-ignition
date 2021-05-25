import { ModuleBindings } from "../../../interfaces/types/module";
import { JsonFragment } from "../../types/artifacts/abi";

export interface IModuleValidator {
  validate(
    bindings: ModuleBindings,
    ABIs: { [name: string]: JsonFragment[] }
  ): void;
}
