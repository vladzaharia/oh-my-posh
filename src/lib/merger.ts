import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { parse, stringify } from 'yaml';
import deepmerge from 'deepmerge';
import { Listr, type ListrTaskWrapper, type ListrRendererFactory } from 'listr2';
import type { YamlConfig, ConfigStats, TaskContext, BuildResult } from '../types/index.js';
import { loadBuildConfig, createVariantConfig } from './variants.js';

/**
 * Custom merge function for arrays - concatenate instead of replacing
 */
function mergeArrays(target: unknown[], source: unknown[]): unknown[] {
  return [...target, ...source];
}

/**
 * Recursively find all YAML files in the config directory
 */
export async function findYamlFiles(
  task: ListrTaskWrapper<TaskContext, ListrRendererFactory, ListrRendererFactory>
): Promise<string[]> {
  const patterns = ['config/**/*.yml', 'config/**/*.yaml'];
  const files: string[] = [];

  task.output = 'Scanning for YAML files...';

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      ignore: ['node_modules/**', 'dist/**'],
      absolute: true,
    });
    files.push(...matches);
    task.output = `Found ${files.length} files so far...`;
  }

  task.output = `Sorting ${files.length} files...`;

  // Custom sort to ensure files in a directory come before subdirectories
  const sortedFiles = files.sort((a, b) => {
    const aParts = a.split('/');
    const bParts = b.split('/');

    // Compare each path segment
    for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
      const aSegment = aParts[i]!;
      const bSegment = bParts[i]!;

      // If we're at the last segment for one of the paths
      if (i === aParts.length - 1 || i === bParts.length - 1) {
        // If both are at their last segment, sort alphabetically
        if (i === aParts.length - 1 && i === bParts.length - 1) {
          return aSegment.localeCompare(bSegment);
        }
        // If 'a' is a file (shorter path) and 'b' is in a subdirectory, 'a' comes first
        if (i === aParts.length - 1) {
          return -1;
        }
        // If 'b' is a file (shorter path) and 'a' is in a subdirectory, 'b' comes first
        if (i === bParts.length - 1) {
          return 1;
        }
      }

      // If segments are different, sort alphabetically
      if (aSegment !== bSegment) {
        return aSegment.localeCompare(bSegment);
      }
    }

    // If all compared segments are equal, shorter path comes first
    return aParts.length - bParts.length;
  });

  task.output = `Found ${sortedFiles.length} YAML files`;
  return sortedFiles;
}

/**
 * Parse a YAML file and return its content
 */
export function parseYamlFile(
  filePath: string,
  task?: ListrTaskWrapper<TaskContext, ListrRendererFactory, ListrRendererFactory>
): YamlConfig {
  try {
    if (task) {
      task.output = `Parsing ${filePath.replace(process.cwd(), '.')}`;
    }

    const content = readFileSync(filePath, 'utf8');
    const parsed = parse(content) as YamlConfig;

    if (!parsed || typeof parsed !== 'object') {
      if (task) {
        task.output = `Warning: ${filePath} does not contain valid YAML object, skipping`;
      }
      return {};
    }

    return parsed;
  } catch (error) {
    if (task) {
      task.output = `Error parsing ${filePath}: ${error}`;
    }
    return {};
  }
}

/**
 * Merge multiple YAML configurations into a single configuration
 */
export function mergeConfigs(configs: YamlConfig[]): YamlConfig {
  if (configs.length === 0) {
    return {};
  }

  if (configs.length === 1) {
    return configs[0]!;
  }

  // First, do a regular merge to get all non-block properties
  const merged = configs.reduce((acc, config) => {
    return deepmerge(acc, config, {
      arrayMerge: mergeArrays,
      customMerge: (key: string) => {
        if (key === 'tooltips') {
          return (target: unknown[], source: unknown[]) => {
            if (Array.isArray(target) && Array.isArray(source)) {
              return [...target, ...source];
            }
            return source;
          };
        }
        // Skip blocks during regular merge - we'll handle them separately
        if (key === 'blocks') {
          return () => undefined;
        }
        return undefined;
      },
    });
  }, {});

  // Now handle blocks specially - consolidate by alignment
  const allBlocks: unknown[] = [];
  const promptSegments: unknown[] = [];
  const rpromptSegments: unknown[] = [];

  configs.forEach(config => {
    if (config['blocks'] && Array.isArray(config['blocks'])) {
      config['blocks'].forEach((block: unknown) => {
        const blockObj = block as Record<string, unknown>;
        if (
          blockObj['type'] === 'prompt' &&
          blockObj['alignment'] === 'left' &&
          Array.isArray(blockObj['segments'])
        ) {
          promptSegments.push(...(blockObj['segments'] as unknown[]));
        } else if (
          blockObj['type'] === 'rprompt' &&
          blockObj['alignment'] === 'right' &&
          Array.isArray(blockObj['segments'])
        ) {
          rpromptSegments.push(...(blockObj['segments'] as unknown[]));
        } else {
          // Keep other block types as-is
          allBlocks.push(block);
        }
      });
    }
  });

  // Create consolidated blocks
  if (promptSegments.length > 0) {
    allBlocks.push({
      type: 'prompt',
      alignment: 'left',
      segments: promptSegments,
    });
  }

  if (rpromptSegments.length > 0) {
    allBlocks.push({
      type: 'rprompt',
      alignment: 'right',
      overflow: 'hide',
      segments: rpromptSegments,
    });
  }

  if (allBlocks.length > 0) {
    merged['blocks'] = allBlocks;
  }

  return merged;
}

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

/**
 * Main merge function - supports building specific variants or all variants
 */
export async function buildConfigurations(specificVariant?: string): Promise<BuildResult> {
  const context: TaskContext = {
    yamlFiles: [],
    configs: [],
    fullConfig: {},
    buildConfig: undefined,
    variantsToBuild: [],
    statistics: {
      filesFound: 0,
      filesParsed: 0,
      variantsBuilt: 0,
      totalSegments: 0,
      totalTooltips: 0,
    },
  };

  const tasks = new Listr<TaskContext>(
    [
      {
        title: 'Scanning for YAML files',
        task: async (ctx, task) => {
          ctx.yamlFiles = await findYamlFiles(task);
          ctx.statistics.filesFound = ctx.yamlFiles.length;

          if (ctx.yamlFiles.length === 0) {
            throw new Error('No YAML files found in config directory');
          }

          task.title = `Found ${ctx.yamlFiles.length} YAML files`;
        },
      },
      {
        title: 'Parsing configuration files',
        task: (ctx, task) => {
          return task.newListr(
            ctx.yamlFiles.map(file => ({
              title: `${file.replace(process.cwd(), '.')}`,
              task: async (subCtx, subTask) => {
                const config = parseYamlFile(file, subTask);
                if (Object.keys(config).length > 0) {
                  subCtx.configs.push(config);
                  subCtx.statistics.filesParsed++;
                  subTask.title = `${file.replace(process.cwd(), '.')} ✓`;
                } else {
                  subTask.skip('Empty or invalid YAML');
                }
              },
            })),
            { concurrent: true, exitOnError: false }
          );
        },
      },
      {
        title: 'Merging configurations',
        task: async (ctx, task) => {
          task.output = 'Consolidating all configurations...';
          ctx.fullConfig = mergeConfigs(ctx.configs);

          // Calculate merged statistics
          if (Array.isArray(ctx.fullConfig['tooltips'])) {
            ctx.statistics.totalTooltips = (ctx.fullConfig['tooltips'] as unknown[]).length;
          }

          if (Array.isArray(ctx.fullConfig['blocks'])) {
            ctx.statistics.totalSegments = (ctx.fullConfig['blocks'] as unknown[]).reduce(
              (total: number, block) => {
                if (
                  block &&
                  typeof block === 'object' &&
                  Array.isArray((block as { segments?: unknown[] }).segments)
                ) {
                  return total + (block as { segments: unknown[] }).segments.length;
                }
                return total;
              },
              0
            );
          }

          task.title = `Merged ${ctx.statistics.filesParsed} files (${ctx.statistics.totalSegments} segments, ${ctx.statistics.totalTooltips} tooltips)`;
        },
      },
    ],
    {
      ctx: context,
      rendererOptions: {
        showSubtasks: true,
      },
    }
  );

  try {
    await tasks.run();
  } catch (error) {
    return {
      success: false,
      variantsBuilt: 0,
      totalSegments: 0,
      totalTooltips: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  // Load build configuration and create variants
  const buildTasks = new Listr<TaskContext>(
    [
      {
        title: 'Loading build configuration',
        task: async (ctx, task) => {
          try {
            ctx.buildConfig = loadBuildConfig();
            task.title = 'Build configuration loaded';
          } catch {
            task.skip('No build configuration found, creating basic merge');
            // Fallback to basic merge
            const basicTasks = new Listr([
              {
                title: 'Writing basic configuration',
                task: async (_subCtx, subTask) => {
                  writeConfigVariant(ctx.fullConfig, 'config.yml', 'Basic', subTask);
                  ctx.statistics.variantsBuilt = 1;
                },
              },
            ]);
            await basicTasks.run();
            return;
          }
        },
      },
      {
        title: 'Determining variants to build',
        skip: ctx => !ctx.buildConfig,
        task: async (ctx, task) => {
          ctx.variantsToBuild = specificVariant
            ? [specificVariant]
            : Object.keys(ctx.buildConfig?.variants ?? {});
          task.title = `Building ${ctx.variantsToBuild.length} variant(s): ${ctx.variantsToBuild.join(', ')}`;
        },
      },
      {
        title: 'Building variants...',
        skip: ctx => !ctx.buildConfig || ctx.variantsToBuild.length === 0,
        task: (ctx, task) => {
          return task.newListr(
            ctx.variantsToBuild.map(variantName => ({
              title: `${variantName} variant`,
              task: async (subCtx, subTask) => {
                const variant = ctx.buildConfig?.variants[variantName];
                if (!variant) {
                  throw new Error(`Variant '${variantName}' not found in build configuration`);
                }

                subTask.output = `Creating ${variantName} configuration...`;
                const variantConfig = createVariantConfig(ctx.fullConfig, variant);
                const result = writeConfigVariant(
                  variantConfig,
                  variant.filename,
                  variantName,
                  subTask
                );

                subCtx.statistics.variantsBuilt++;
                subTask.title = `${variantName} variant (${result.stats.totalSegments} segments)`;
              },
            })),
            { concurrent: false, exitOnError: false }
          );
        },
      },
    ],
    {
      ctx: context,
      rendererOptions: {
        showSubtasks: true,
      },
    }
  );

  try {
    await buildTasks.run();

    return {
      success: true,
      variantsBuilt: context.statistics.variantsBuilt,
      totalSegments: context.statistics.totalSegments,
      totalTooltips: context.statistics.totalTooltips,
    };
  } catch (error) {
    return {
      success: false,
      variantsBuilt: context.statistics.variantsBuilt,
      totalSegments: context.statistics.totalSegments,
      totalTooltips: context.statistics.totalTooltips,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
