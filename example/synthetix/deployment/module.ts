import {
  ContractBinding,
  ContractEvent,
  expectFuncRead,
  gracefulExpectFuncRead,
  module,
  ModuleConfig
} from '../../../src/interfaces/mortar';
import * as web3utils from 'web3-utils';
import { toBytes32 } from '../util/util';
import { DEFAULTS } from '../util/constants';
import { SynthetixLibraries, SynthetixPrototypes } from './modules/helper.module';
import { SynthetixCore } from './modules/core.module';
import { BinaryOptionsModule } from './modules/binary_options.module';
import { DappUtilities } from './modules/dapp_utilities.module';
import { SynthetixSynths } from './modules/synths.module';
import { SynthetixAncillary } from './modules/ancillary.module';
import { SynthetixInverseSynths } from './modules/inverse_synthes.module';
import { SynthetixRebuildCache } from './modules/rebuild_cache_module.module';
import { SystemSettingsModule } from './modules/system_setting_setup.module';
import { SynthetixModuleBuilder } from '../.mortar/SynthetixModule/SynthetixModule';

const moduleConfig = require('./local/config.json') as ModuleConfig;

export const SynthetixModule = module('SynthetixModule', async (m: SynthetixModuleBuilder) => {
  await m.bindModule(SynthetixLibraries);
  await m.bindModule(SynthetixPrototypes);

  await m.bindModule(SynthetixCore);

  await m.bindModule(SynthetixSynths);
  await m.bindModule(BinaryOptionsModule);
  await m.bindModule(DappUtilities);
  await m.bindModule(SynthetixAncillary);
  await m.bindModule(SynthetixInverseSynths);
  await m.bindModule(SynthetixRebuildCache);
  await m.bindModule(SystemSettingsModule);

  const Issuer = m.Issuer;
  const DebtCache = m.DebtCache;

  const synths = require('./local/synths.json');
  const filteredSynths: { synth: ContractBinding, currencyKeyInBytes: string }[] = [];
  const synthsToAdd: { synth: ContractBinding, currencyKeyInBytes: string }[] = [];
  for (const {name: currencyKey} of synths) {
    const currencyKeyInBytes = toBytes32(currencyKey);
    const Synth = m[`Synth${currencyKey}`];

    synthsToAdd.push({
      synth: Synth,
      currencyKeyInBytes,
    });
  }
  for (const Synth of synthsToAdd) {
    m.group(Issuer, Synth.synth).afterDeploy(m, `afterDeployIssuerForSynth${Synth.synth.name}`, async (): Promise<void> => {
      if (!await gracefulExpectFuncRead(Synth.synth, Issuer.instance().synths, Synth.currencyKeyInBytes)) {
        filteredSynths.push(Synth);
      }
    });
  }

  const synthChunkSize = 15;

  for (let i = 0; i < filteredSynths.length; i += synthChunkSize) {
    const chunk = filteredSynths.slice(i, i + synthChunkSize);
    const chunkBindings = chunk.map(synth => synth.synth);

    m.group(Issuer, ...chunkBindings).afterDeploy(m, `afterDeployIssuerWithSynth${(i + synthChunkSize) / synthChunkSize}`, async (): Promise<void> => {
      await Issuer.instance().addSynths([chunkBindings.map(synth => synth)]);
      await expectFuncRead(chunkBindings, Issuer.instance().getSynths, [chunk.map(synth => synth.currencyKeyInBytes)]);
    });
  }

  const afterDeploySystemSetting = m.afterDeploySystemSetting.event as ContractEvent;
  m.group(...Object.values(m.getAllBindings()), afterDeploySystemSetting).afterDeploy(m, 'afterDeployDebtCacheAndAllBindingsAndEvents', async (): Promise<void> => {
    await checkSnapshot();
  });

  const refreshSnapshotIfPossible = async (wasInvalid: boolean, isInvalid: boolean, force = false) => {
    const validityChanged = wasInvalid !== isInvalid;

    if (force || validityChanged) {
      DebtCache.instance().takeDebtSnapshot({
        gasLimit: 2.5e6
      });
    } else if (!validityChanged) {

    }
  };

  const checkSnapshot = async () => {
    const [cacheInfo, currentDebt] = await Promise.all([
      DebtCache.instance().cacheInfo(),
      DebtCache.instance().currentDebt(),
    ]);

    // Check if the snapshot is stale and can be fixed.
    if (cacheInfo.isStale && !currentDebt.anyRateIsInvalid) {
      await refreshSnapshotIfPossible(
        cacheInfo.isInvalid,
        currentDebt.anyRateIsInvalid,
        cacheInfo.isStale
      );
      return true;
    }

    // Otherwise, if the rates are currently valid,
    // we might still need to take a snapshot due to invalidity or deviation.
    if (!currentDebt.anyRateIsInvalid) {
      if (cacheInfo.isInvalid) {
        await refreshSnapshotIfPossible(
          cacheInfo.isInvalid,
          currentDebt.anyRateIsInvalid,
          cacheInfo.isStale
        );
        return true;
      } else {
        const cachedDebtEther = web3utils.fromWei(cacheInfo.debt);
        const currentDebtEther = web3utils.fromWei(currentDebt.debt);
        const deviation =
          (Number(currentDebtEther) - Number(cachedDebtEther)) / Number(cachedDebtEther);
        const maxDeviation = DEFAULTS.debtSnapshotMaxDeviation;

        if (maxDeviation <= Math.abs(deviation)) {
          await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, true);
          return true;
        }
      }
    }

    // Finally, if the debt cache is currently valid, but needs to be invalidated, we will also perform a snapshot.
    if (!cacheInfo.isInvalid && currentDebt.anyRateIsInvalid) {
      await refreshSnapshotIfPossible(cacheInfo.isInvalid, currentDebt.anyRateIsInvalid, false);
      return true;
    }

    return false;
  };
}, moduleConfig);
