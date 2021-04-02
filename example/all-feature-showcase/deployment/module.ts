import { ContractBinding, buildModule, ModuleBuilder } from '../../../src';
import { BigNumber, ethers } from 'ethers';
import { filler } from '../../../src';

export const ExampleModule = buildModule('ExampleModule', async (m: ModuleBuilder, wallets: ethers.Wallet[]) => {
  // filler(m, wallets[0], wallets.slice(1), ethers.utils.parseUnits('1', 'wei'));

  const Example = m.contract('Example', -1, '2', 3, '4', true, BigNumber.from(5), '0xdd2fd4581271e230360230f9337d5c0430bf44c0')
    .setDeployer(wallets[0])
    .force();
  Example.shouldRedeploy((resolved: ContractBinding) => {
    return true;
  });

  const SecondExample = m.contract('SecondExample', Example, ['some', 'random', 'string'], [['hello']], 123);
  const ThirdExample = m.contract('ThirdExample', SecondExample);

  m.registerAction('getName', (): any => {
    return 'hello';
  });

  const firstAfterDeploy = m.group(Example, SecondExample).afterDeploy(m, 'firstAfterDeploy', async function (): Promise<void> {
    const example = Example.deployed();

    await example.setExample(100);
    let value = await example.getExample();

    await example.setExample(120);
    value = await example.getExample();

    await SecondExample.deployed().setExample(Example);

    m.registerAction('getName', (): any => {
      return value;
    });
  }, Example, SecondExample);

  m.group(Example, firstAfterDeploy).afterDeploy(m, 'secondAfterDeploy', async () => {
    const example = Example.deployed();

    await example.setExample(100);
    await example.setExample(130);
  }, Example);

  SecondExample.afterCompile(m, 'firstAfterCompile', async () => {
  });

  ThirdExample.beforeCompile(m, 'firstBeforeCompile', async () => {
  }, Example);

  ThirdExample.beforeDeploy(m, 'firstBeforeDeploy', async () => {
  }, Example);

  ThirdExample.onChange(m, 'firstOnChange', async () => {
  }, Example);

  m.onStart('OnStart', async () => {
  });

  m.onCompletion('onCompletion', async () => {
  });

  m.onFail('onFail', async () => {
  });

  m.onSuccess('onSuccess', async () => {
  });
});

export const SecondModule = buildModule('SecondExample', async (m: ModuleBuilder) => {
  const Example = m.contract('Example', -1, '2', 3, '4', true, BigNumber.from(5), '0xdd2fd4581271e230360230f9337d5c0430bf44c0');
  const SecondExample = m.contract('SecondExample', Example, ['some', 'random', 'string'], [['hello']], 123);
  m.contract('ThirdExample', SecondExample);
});
