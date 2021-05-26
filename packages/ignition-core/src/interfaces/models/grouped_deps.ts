import { Namespace } from "cls-hooked";

import { JsonFragment } from "../../services/types/artifacts/abi";
import { ShouldRedeployAlreadyDefinedError } from "../../services/types/errors";
import {
  AfterCompileEvent,
  AfterDeployEvent,
  BeforeCompileEvent,
  BeforeDeployEvent,
  ContractEvent,
  EventFn,
  EventFnCompiled,
  EventFnDeployed,
  EventType,
  OnChangeEvent,
  RedeployFn,
  SearchParams,
  ShouldRedeployFn,
} from "../types";

import { ContractBinding } from "./contract";
import { ModuleBuilder } from "./module_builder";

export class GroupedDependencies {
  public dependencies: Array<ContractBinding | ContractEvent>;
  public moduleSession: Namespace;

  constructor(
    dependencies: Array<ContractBinding | ContractEvent>,
    moduleSession: Namespace
  ) {
    this.dependencies = dependencies;
    this.moduleSession = moduleSession;
  }

  // util
  public find(searchParams: SearchParams): GroupedDependencies {
    const bindings = this.dependencies.filter(
      (target: ContractBinding | ContractEvent) => {
        return ((target as ContractBinding)?.abi as JsonFragment[]).find(
          ({ name }) => name === searchParams?.functionName
        );
      }
    ) as ContractBinding[];

    return new GroupedDependencies(bindings, this.moduleSession);
  }

  public exclude(...elementNames: string[]): GroupedDependencies {
    const newBindings = this.dependencies.filter((target) => {
      const fullExpr = new RegExp(
        elementNames.map((elementName: string) => elementName).join("|")
      );

      return !fullExpr.test(target.name);
    });

    return new GroupedDependencies(newBindings, this.moduleSession);
  }

  public map(
    fn: (
      value: ContractBinding,
      index: number,
      array: Array<ContractBinding | ContractEvent>
    ) => any
  ): Array<ContractBinding | ContractEvent> {
    const resultArray = [];
    for (let index = 0; index < this.dependencies.length; index++) {
      resultArray.push(
        fn(
          this.dependencies[index] as ContractBinding,
          index,
          this.dependencies
        )
      );
    }

    return resultArray;
  }

  public shouldRedeploy(fn: ShouldRedeployFn): void {
    for (let dependency of this.dependencies) {
      dependency = dependency as ContractBinding;
      if (dependency._isContractBinding) {
        if (dependency.deployMetaData.shouldRedeploy) {
          throw new ShouldRedeployAlreadyDefinedError(dependency.name);
        }

        dependency.deployMetaData.shouldRedeploy = fn;
      }
    }
  }

  // event hooks
  // beforeDeploy runs each time the Binding is about to be triggered.
  // This event can be used to force the binding in question to be deployed.
  public beforeDeploy(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnCompiled,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.BeforeDeployEvent,
      this.dependencies,
      usages,
      this.moduleSession
    );
    const beforeDeploy: BeforeDeployEvent = {
      ...generateBaseEvent,
      fn,
    };

    for (let dep of this.dependencies) {
      dep = dep as ContractBinding;
      if (dep._isContractBinding) {
        if (dep.eventsDeps.beforeDeploy.includes(eventName)) {
          continue;
        }

        dep.eventsDeps.beforeDeploy.push(eventName);
      }
    }

    m.addEvent(eventName, beforeDeploy);
    return beforeDeploy;
  }

  // afterDeploy runs after the Binding was deployed.
  public afterDeploy(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnDeployed,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.AfterDeployEvent,
      this.dependencies,
      usages,
      this.moduleSession
    );
    const afterDeploy: AfterDeployEvent = {
      ...generateBaseEvent,
      fn,
    };

    for (let dep of this.dependencies) {
      dep = dep as ContractBinding;
      if (dep._isContractBinding) {
        if (dep.eventsDeps.afterDeploy.includes(eventName)) {
          continue;
        }

        dep.eventsDeps.afterDeploy.push(eventName);
      }
    }

    m.addEvent(eventName, afterDeploy);
    return afterDeploy;
  }

  // beforeCompile runs before the source code is compiled.
  public beforeCompile(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFn,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.BeforeCompileEvent,
      this.dependencies,
      usages,
      this.moduleSession
    );
    const beforeCompile: BeforeCompileEvent = {
      ...generateBaseEvent,
      fn,
    };

    for (let dep of this.dependencies) {
      dep = dep as ContractBinding;
      if (dep._isContractBinding) {
        if (dep.eventsDeps.beforeCompile.includes(eventName)) {
          continue;
        }

        dep.eventsDeps.beforeCompile.push(eventName);
      }
    }

    m.addEvent(eventName, beforeCompile);
    return beforeCompile;
  }

  // afterCompile runs after the source code is compiled and the bytecode is available.
  public afterCompile(
    m: ModuleBuilder,
    eventName: string,
    fn: EventFnCompiled,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.AfterCompileEvent,
      this.dependencies,
      usages,
      this.moduleSession
    );
    const afterCompile: AfterCompileEvent = {
      ...generateBaseEvent,
      fn,
    };

    for (let dep of this.dependencies) {
      dep = dep as ContractBinding;
      if (dep._isContractBinding) {
        if (dep.eventsDeps.afterCompile.includes(eventName)) {
          continue;
        }

        dep.eventsDeps.afterCompile.push(eventName);
      }
    }

    m.addEvent(eventName, afterCompile);
    return afterCompile;
  }

  // onChange runs after the Binding gets redeployed or changed
  public onChange(
    m: ModuleBuilder,
    eventName: string,
    fn: RedeployFn,
    ...usages: Array<ContractBinding | ContractEvent>
  ): ContractEvent {
    const generateBaseEvent = ContractBinding.generateBaseEvent(
      eventName,
      EventType.OnChangeEvent,
      this.dependencies,
      usages,
      this.moduleSession
    );
    const onChangeEvent: OnChangeEvent = {
      ...generateBaseEvent,
      fn,
    };

    for (let dep of this.dependencies) {
      dep = dep as ContractBinding;
      if (dep._isContractBinding) {
        if (dep.eventsDeps.onChange.includes(eventName)) {
          continue;
        }

        dep.eventsDeps.onChange.push(eventName);
      }
    }

    m.addEvent(eventName, onChangeEvent);
    return onChangeEvent;
  }
}
