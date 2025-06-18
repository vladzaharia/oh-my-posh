import { Command, Flags } from '@oclif/core';
import {
  getAvailableVariants,
  getDefaultVariant,
  getFallbackVariant,
  getVariant,
} from '../lib/variants.js';

export default class Variants extends Command {
  static override summary = 'List available Oh My Posh configuration variants';

  static override description = `List all available configuration variants defined in the build configuration.

Each variant represents a different combination of segments, features, and configurations
that can be built from the modular YAML files in the config/ directory.`;

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --detailed',
  ];

  static override flags = {
    detailed: Flags.boolean({
      char: 'd',
      description: 'Show detailed information about each variant',
      default: false,
    }),
    json: Flags.boolean({
      description: 'Output results as JSON',
      default: false,
    }),
  };

  static override enableJsonFlag = true;

  public async run(): Promise<{
    variants: Array<{
      name: string;
      description?: string;
      filename?: string;
      include?: Record<string, unknown>;
      exclude?: { segments?: string[] };
      isDefault: boolean;
      isFallback: boolean;
    }>;
    defaultVariant: string | null;
    fallbackVariant: string | null;
    count: number;
  }> {
    const { flags } = await this.parse(Variants);

    try {
      const availableVariants = getAvailableVariants();
      const defaultVariant = getDefaultVariant();
      const fallbackVariant = getFallbackVariant();

      if (availableVariants.length === 0) {
        if (!flags.json) {
          this.warn('No variants found in build configuration');
        }
        return {
          variants: [],
          defaultVariant: null,
          fallbackVariant: null,
          count: 0,
        };
      }

      const variantDetails = flags.detailed
        ? availableVariants.map(name => {
            try {
              const variant = getVariant(name);
              return {
                name,
                description: variant.description,
                filename: variant.filename,
                include: variant.include,
                exclude: variant.exclude,
                isDefault: name === defaultVariant,
                isFallback: name === fallbackVariant,
              };
            } catch {
              return {
                name,
                description: 'Error loading variant details',
                filename: 'unknown',
                include: {},
                exclude: {},
                isDefault: name === defaultVariant,
                isFallback: name === fallbackVariant,
              };
            }
          })
        : availableVariants.map(name => ({
            name,
            isDefault: name === defaultVariant,
            isFallback: name === fallbackVariant,
          }));

      if (!flags.json) {
        this.log('📋 Available Oh My Posh configuration variants:\n');

        if (flags.detailed) {
          variantDetails.forEach(variant => {
            const badges = [];
            if (variant.isDefault) badges.push('DEFAULT');
            if (variant.isFallback) badges.push('FALLBACK');
            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

            this.log(`🎯 ${variant.name}${badgeStr}`);
            if ('description' in variant) {
              this.log(`   Description: ${variant.description}`);
            }
            if ('filename' in variant) {
              this.log(`   Output file: ${variant.filename}`);
            }

            if (
              'include' in variant &&
              variant.include &&
              Object.keys(variant.include).length > 0
            ) {
              const included = Object.entries(variant.include)
                .filter(([, value]) => value !== false)
                .map(([key]) => key)
                .join(', ');
              if (included) {
                this.log(`   Includes: ${included}`);
              }
            }

            if (
              'exclude' in variant &&
              variant.exclude &&
              typeof variant.exclude === 'object' &&
              'segments' in variant.exclude &&
              Array.isArray(variant.exclude.segments) &&
              variant.exclude.segments.length > 0
            ) {
              this.log(`   Excludes: ${variant.exclude.segments.join(', ')}`);
            }

            this.log('');
          });
        } else {
          variantDetails.forEach(variant => {
            const badges = [];
            if (variant.isDefault) badges.push('DEFAULT');
            if (variant.isFallback) badges.push('FALLBACK');
            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';

            this.log(`  • ${variant.name}${badgeStr}`);
          });

          this.log(`\n💡 Use --detailed flag for more information about each variant`);
          this.log(`💡 Use 'omp build <variant>' to build a specific variant`);
        }
      }

      return {
        variants: variantDetails,
        defaultVariant,
        fallbackVariant,
        count: availableVariants.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.error(`❌ Failed to load variants: ${errorMessage}`);
    }
  }
}
