#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { parse, stringify } from 'yaml';
import deepmerge from 'deepmerge';

interface YamlConfig {
  [key: string]: unknown;
}

/**
 * Custom merge function for arrays - concatenate instead of replacing
 */
function mergeArrays(target: unknown[], source: unknown[]): unknown[] {
  return [...target, ...source];
}

/**
 * Recursively find all YAML files in the config directory
 */
async function findYamlFiles(): Promise<string[]> {
  const patterns = ['config/**/*.yml', 'config/**/*.yaml'];
  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      ignore: ['node_modules/**', 'dist/**'],
      absolute: true,
    });
    files.push(...matches);
  }

  // Custom sort to ensure files in a directory come before subdirectories
  return files.sort((a, b) => {
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
}

/**
 * Parse a YAML file and return its content
 */
function parseYamlFile(filePath: string): YamlConfig {
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = parse(content) as YamlConfig;

    if (!parsed || typeof parsed !== 'object') {
      console.warn(`Warning: ${filePath} does not contain valid YAML object, skipping`);
      return {};
    }

    return parsed;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return {};
  }
}

/**
 * Merge multiple YAML configurations into a single configuration
 */
function mergeConfigs(configs: YamlConfig[]): YamlConfig {
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
 * Main build function
 */
async function build(): Promise<void> {
  console.log('🔍 Finding YAML files...');

  const yamlFiles = await findYamlFiles();

  if (yamlFiles.length === 0) {
    console.error('❌ No YAML files found in src directory');
    process.exit(1);
  }

  console.log(`📁 Found ${yamlFiles.length} YAML files:`);
  yamlFiles.forEach(file => {
    console.log(`   - ${file.replace(process.cwd(), '.')}`);
  });

  console.log('\n📖 Parsing YAML files...');
  const configs: YamlConfig[] = [];

  for (const file of yamlFiles) {
    const config = parseYamlFile(file);
    if (Object.keys(config).length > 0) {
      configs.push(config);
    }
  }

  console.log(`✅ Successfully parsed ${configs.length} configuration files`);

  console.log('\n🔄 Merging configurations...');
  const mergedConfig = mergeConfigs(configs);

  console.log('\n📝 Writing merged configuration...');
  const outputPath = join(process.cwd(), 'dist', 'config.yml');
  ensureOutputDir(outputPath);

  try {
    const yamlOutput = stringify(mergedConfig, {
      indent: 2,
      lineWidth: 120,
      minContentWidth: 0,
      doubleQuotedAsJSON: false,
      doubleQuotedMinMultiLineLength: 40,
      singleQuote: false,
    });

    writeFileSync(outputPath, yamlOutput, 'utf8');
    console.log(`✅ Configuration written to: ${outputPath.replace(process.cwd(), '.')}`);

    // Log some statistics
    const stats = {
      totalKeys: Object.keys(mergedConfig).length,
      hasTooltips: Array.isArray(mergedConfig['tooltips']) ? (mergedConfig['tooltips'] as unknown[]).length : 0,
      hasBlocks: Array.isArray(mergedConfig['blocks']) ? (mergedConfig['blocks'] as unknown[]).length : 0,
      hasPalette: mergedConfig['palette'] ? Object.keys(mergedConfig['palette'] as object).length : 0,
    };

    console.log('\n📊 Configuration statistics:');
    console.log(`   - Top-level keys: ${stats.totalKeys}`);
    console.log(`   - Tooltips: ${stats.hasTooltips}`);
    console.log(`   - Blocks: ${stats.hasBlocks}`);
    console.log(`   - Palette colors: ${stats.hasPalette}`);
  } catch (error) {
    console.error('❌ Error writing configuration file:', error);
    process.exit(1);
  }

  console.log('\n🎉 Build completed successfully!');
}

// Run the build if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
  });
}

export { build };
