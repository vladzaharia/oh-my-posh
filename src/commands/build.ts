import { Args, Command } from '@oclif/core';
import { buildConfigurations } from '../lib/orchestrator.js';
import { getAvailableVariants } from '../lib/builder.js';

export default class Build extends Command {
  static override aliases = ['b'];
  static override summary = 'Build Oh My Posh configuration variants';

  static override description = `Build Oh My Posh configuration variants from modular YAML files.

This command scans the config/ directory for YAML files, merges them according to the build configuration,
and outputs the specified variant(s) to the dist/ directory.

If no variant is specified, all variants defined in the build configuration will be built.
Use 'omp variants' to see available variants.`;

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> full',
    '<%= config.bin %> <%= command.id %> minimal',
  ];

  static override args = {
    variant: Args.string({
      description: 'Specific variant to build (e.g., "full", "minimal")',
      required: false,
    }),
  };

  static override flags = {};

  public async run(): Promise<void> {
    const { args } = await this.parse(Build);
    const { variant } = args;

    try {
      // Validate variant if specified
      if (variant) {
        const availableVariants = getAvailableVariants();
        if (!availableVariants.includes(variant)) {
          this.error(
            `Unknown variant '${variant}'. Available variants: ${availableVariants.join(', ')}`,
            {
              suggestions: [
                'Run "omp variants" to see all available variants',
                `Try one of: ${availableVariants.slice(0, 3).join(', ')}`,
              ],
            }
          );
        }
      }

      if (variant) {
        this.log(`🎯 Building specific variant: ${variant}`);
      } else {
        this.log('🏗️  Building all variants...');
      }

      const result = await buildConfigurations(variant);

      if (!result.success) {
        const errorMessage = result.errors?.join(', ') ?? 'Unknown error occurred';
        this.error(`❌ Build failed: ${errorMessage}`);
      }

      this.log('\n🎉 Build completed successfully!');
      this.log('📊 Summary:');
      this.log(`   - Variants built: ${result.variantsBuilt}`);
      this.log(`   - Total segments: ${result.totalSegments}`);
      this.log(`   - Total tooltips: ${result.totalTooltips}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`❌ Build failed: ${errorMessage}`);
    }
  }
}
