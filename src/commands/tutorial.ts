import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';
import * as command from '../index';
import { TutorialService } from '../services/tutorial/tutorial_service';
import { DeploymentFileGenerator } from '../services/tutorial/deployment_file_gen';
import { DeploymentFileRepo } from '../services/tutorial/deployment_file_repo';
import { StreamlinedPrompter } from '../services/utils/logging/prompter';
import { SystemCrawlingService } from '../services/tutorial/system_crawler';
import { GlobalConfigService } from '../services/config/global_config_service';
import { AnalyticsService } from '../services/utils/analytics/analytics_service';
import { errorHandling } from '../index';
import { CommandParsingFailed } from '../services/types/errors';

const ARTIFACTS_FOLDER = 'artifacts';

export default class Tutorial extends Command {
  static description = 'Easiest way to get started with hardhat-ignition, create couple contracts and start deploying.';
  private prompter: StreamlinedPrompter | undefined;
  private analyticsService: AnalyticsService | undefined;

  static flags = {
    help: flags.help({char: 'h'}),
    debug: flags.boolean(
      {
        name: 'debug',
        description: 'Flag used for debugging'
      }
    )
  };

  async run() {
    let args;
    let flags;
    try {
      const commandOutput = this.parse(Tutorial);
      args = commandOutput.args;
      flags = commandOutput.flags;
    } catch (err) {
      throw new CommandParsingFailed(err);
    }    if (flags.debug) {
      cli.config.outputLevel = 'debug';
      process.env.DEBUG = '*';
    }

    const globalConfigService = new GlobalConfigService();
    await globalConfigService.mustConfirmConsent();
    this.analyticsService = new AnalyticsService(globalConfigService);

    this.prompter = new StreamlinedPrompter();
    const deploymentFileRepo = new DeploymentFileRepo();
    const deploymentFileGenerator = new DeploymentFileGenerator(deploymentFileRepo);
    const systemCrawlingService = new SystemCrawlingService(process.cwd(), ARTIFACTS_FOLDER);
    const tutorialService = new TutorialService(deploymentFileGenerator, systemCrawlingService);

    await command.tutorial(tutorialService, this.analyticsService);
  }

  async catch(error: Error) {
    await errorHandling.bind(this)(error);
  }
}
