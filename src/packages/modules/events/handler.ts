import {
  AfterDeployEvent, BeforeDeployEvent,
  CompiledContractBinding,
  ContractBinding,
  DeployedContractBinding
} from "../../../interfaces/mortar";
import {checkIfExist} from "../../utils/util";
import {ModuleStateRepo} from "../states/state_repo";

export class EventHandler {
  private readonly moduleState: ModuleStateRepo
  constructor(moduleState: ModuleStateRepo) {
    this.moduleState = moduleState
  }

  static async executeBeforeCompileEventHook(binding: ContractBinding, bindings: { [p: string]: ContractBinding }): Promise<void> {
    const events = binding?.events?.beforeCompile
    if (!checkIfExist(events)) {
      return
    }

    for (let event of events) {
      const fn = event.fn
      const deps = event.deps

      let binds: ContractBinding[] = []
      for (let dependency of deps) {
        const name = dependency.name
        binds.push(bindings[name])
      }

      await fn(binding, ...binds)
    }
  }

   static async executeAfterCompileEventHook(binding: CompiledContractBinding, bindings: { [p: string]: CompiledContractBinding }): Promise<void> {
    const events = binding?.events?.afterCompile
    await this.handleCompiledBindingsEvents(events, binding, bindings)
  }

   static async executeBeforeDeploymentEventHook(binding: CompiledContractBinding, bindings: { [p: string]: CompiledContractBinding }): Promise<void> {
    const events = binding?.events?.beforeDeployment
    await this.handleCompiledBindingsEvents(events, binding, bindings)
  }

   async executeAfterDeploymentEventHook(moduleName: string, binding: DeployedContractBinding, bindings: { [p: string]: DeployedContractBinding }): Promise<void> {
    const events = binding?.events?.afterDeployment
    await this.handleDeployedBindingsEvents(moduleName, events, binding, bindings)
  }

   static async executeBeforeDeployEventHook(binding: CompiledContractBinding, bindings: { [p: string]: CompiledContractBinding }): Promise<void> {
    const events = binding?.events?.beforeDeploy
    await this.handleCompiledBindingsEvents(events, binding, bindings)
  }

   async executeAfterDeployEventHook(moduleName: string, binding: DeployedContractBinding, bindings: { [p: string]: DeployedContractBinding }): Promise<void> {
    const events = binding?.events?.afterDeploy
    await this.handleDeployedBindingsEvents(moduleName, events, binding, bindings)
  }

   async executeOnChangeEventHook(moduleName: string, binding: DeployedContractBinding, bindings: { [p: string]: DeployedContractBinding }): Promise<void> {
    const events = binding?.events?.onChange
    await this.handleDeployedBindingsEvents(moduleName, events, binding, bindings)
  }

  private async handleDeployedBindingsEvents(
    moduleName: string,
    deployEvents: AfterDeployEvent[],
    binding: DeployedContractBinding,
    bindings: { [p: string]: DeployedContractBinding }
  ) {
    if (!checkIfExist(deployEvents)) {
      return
    }

    for (let event of deployEvents) {
      const fn = event.fn
      const deps = event.deps

      let binds: DeployedContractBinding[] = []
      for (let dependency of deps) {
        const name = dependency.name
        binds.push(bindings[name])
      }

      const eventBindings = await fn(binding, ...binds)

      for (let bind of eventBindings) {
        const name = bind.name
        bindings[name] = bind
      }

      await this.moduleState.storeNewState(moduleName, bindings)
    }
  }

  private static async handleCompiledBindingsEvents(
    beforeDeployEvents: BeforeDeployEvent[],
    binding: CompiledContractBinding,
    bindings: { [p: string]: CompiledContractBinding }
  ) {
    if (!checkIfExist(beforeDeployEvents)) {
      return
    }

    for (let event of beforeDeployEvents) {
      const fn = event.fn
      const deps = event.deps


      let binds: CompiledContractBinding[] = []
      for (let dependency of deps) {
        const name = dependency.name
        binds.push(bindings[name])
      }

      await fn(binding, ...binds)
    }
  }
}