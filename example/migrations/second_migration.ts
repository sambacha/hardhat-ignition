import {module, ModuleBuilder} from "../../src/interfaces/mortar";
import {BigNumber} from "ethers";

export const ThirdExampleModule = module("ThirdExampleModule", (m: ModuleBuilder) => {
  const Example = m.contract('Example', -1, "2", 3, "4", true, BigNumber.from(5), "0xdd2fd4581271e230360230f9337d5c0430bf44c0");
  const SecondExample = m.contract('SecondExample', Example, ["some", "random", "string"], [["hello"]], 123);
  m.contract('ThirdExample', SecondExample)
})
