import { Listr } from 'listr2';
import type { TaskContext, BuildResult } from '../types/index.js';
import { findYamlFiles } from './scanner.js';
import { parseYamlFile } from './parser.js';
import { mergeConfigs } from './merger.js';
import { loadBuildConfig, createVariantConfig } from './builder.js';
import { writeConfigVariant } from './writer.js';

/**
 * Main build orchestrator - supports building specific variants or all variants
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
