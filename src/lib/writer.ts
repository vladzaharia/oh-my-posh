import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { stringify } from 'yaml';
import type { ListrTaskWrapper, ListrRendererFactory } from 'listr2';
import type { YamlConfig, ConfigStats, TaskContext } from '../types/index.js';

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(outputPath: string): void {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a configuration variant to file
 */
export function writeConfigVariant(
  config: YamlConfig,
  filename: string,
  variantName: string,
  task?: ListrTaskWrapper<TaskContext, ListrRendererFactory, ListrRendererFactory>
): { stats: ConfigStats } {
  const outputPath = join(process.cwd(), 'dist', filename);
  ensureOutputDir(outputPath);

  try {
    if (task) {
      task.output = `Writing ${variantName} configuration...`;
    }

    const yamlOutput = stringify(config, {
      indent: 2,
      lineWidth: 120,
      minContentWidth: 0,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      singleQuote: false,
    });

    writeFileSync(outputPath, yamlOutput, 'utf8');

    // Calculate statistics
    const stats = {
      totalKeys: Object.keys(config).length,
      hasTooltips: Array.isArray(config['tooltips']) ? (config['tooltips'] as unknown[]).length : 0,
      hasBlocks: Array.isArray(config['blocks']) ? (config['blocks'] as unknown[]).length : 0,
      hasPalette: config['palette'] ? Object.keys(config['palette'] as object).length : 0,
      totalSegments: 0,
    };

    // Count segments across all blocks
    if (Array.isArray(config['blocks'])) {
      stats.totalSegments = (config['blocks'] as unknown[]).reduce((total: number, block) => {
        if (
          block &&
          typeof block === 'object' &&
          Array.isArray((block as { segments?: unknown[] }).segments)
        ) {
          return total + (block as { segments: unknown[] }).segments.length;
        }
        return total;
      }, 0);
    }

    if (task) {
      task.output = `${variantName} written: ${stats.totalSegments} segments, ${stats.hasTooltips} tooltips`;
    }

    return { stats };
  } catch (error) {
    if (task) {
      task.output = `Error writing ${variantName}: ${error}`;
    }
    throw error;
  }
}
