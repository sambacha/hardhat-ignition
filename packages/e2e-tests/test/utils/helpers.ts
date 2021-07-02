import { ethers } from "ethers";
import { resetHardhatContext } from "hardhat/plugins-testing";
import { EIP1193Provider } from "hardhat/types";
import { IgnitionCore } from "ignition-core";
import path from "path";

const networkId = "31337";
const rootDir = process.cwd();

const testPrivateKeys = [
  new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  ),
  new ethers.Wallet(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  ),
];

export function useFixedProjectEnvironment(
  projectFileName: string,
  networkName = "hardhat"
) {
  const projectLocation = path.resolve(
    rootDir,
    `./test/projects-scenarios/${projectFileName}`
  );

  beforeEach("Loading hardhat", function () {
    process.chdir(projectLocation);
    process.env.HARDHAT_NETWORK = networkName;
    this.networkName = networkName;

    this.hardhatEnvironment = require("hardhat");
  });
  afterEach("Resetting hardhat", () => {
    resetHardhatContext();
  });

  return projectLocation;
}

export function useExampleProjectsEnvironment(
  projectFileName: string,
  networkName = "localhost"
): string {
  const projectLocation = path.resolve(
    rootDir,
    `../example-projects/${projectFileName}`
  );

  beforeEach("Loading hardhat", function () {
    process.chdir(projectLocation);
    process.env.HARDHAT_NETWORK = networkName;
    this.networkName = networkName;

    this.hardhatEnvironment = require("hardhat");
  });
  afterEach("Resetting hardhat", () => {
    resetHardhatContext();
  });

  return projectLocation;
}

export function initIgnition(exampleProject = false) {
  beforeEach(async function () {
    let hardhatProvider: ethers.providers.JsonRpcProvider = new ethers.providers.Web3Provider(
      this.hardhatEnvironment.network.provider as EIP1193Provider
    );
    if (exampleProject) {
      hardhatProvider = new ethers.providers.JsonRpcProvider();
    }

    const networkName = this.hardhatEnvironment.network.name;

    this.ignition = new IgnitionCore(
      {
        networkName,
        networkId,
        rpcProvider: hardhatProvider,
        signers: testPrivateKeys,
        test: true,
        logging: false,
      },
      {},
      {}
    );
    await this.ignition.mustInit();
  });

  afterEach(async function () {
    if (this.ignition?.moduleStateRepo !== undefined) {
      this.ignition.moduleStateRepo.clear();
    }
    process.chdir(rootDir);

    // resolving same reference of an object that is required multiple times
    require.cache = {};
  });
}
