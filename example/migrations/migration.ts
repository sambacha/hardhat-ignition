import {ModuleBuilder, module} from "../../src/interfaces/mortar"

export const ExampleModule = module((m: ModuleBuilder) => {
  // Bind contracts for deployment.
  const Example = m.bind('Example');
  const SecondExample = m.bind('SecondExample', Example);
  m.bind('ThirdExample', SecondExample);
})
