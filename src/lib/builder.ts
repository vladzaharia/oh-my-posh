import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { parse } from 'yaml';
import type { YamlConfig, BuildVariant, BuildConfig } from '../types/index.js';
import { getRepoRoot } from './utils.js';

/**
 * Load build configuration from build/ directory
 */
export function loadBuildConfig(): BuildConfig {
  try {
    const repoRoot = getRepoRoot();
    const buildDir = join(repoRoot, 'build');
    const variants: Record<string, BuildVariant> = {};

    // Load all variant files
    const files = readdirSync(buildDir);
    for (const file of files) {
      const filePath = join(buildDir, file);
      const stat = statSync(filePath);

      if (stat.isFile() && (extname(file) === '.yml' || extname(file) === '.yaml')) {
        const variantName = file.replace(/\.(yml|yaml)$/, '');
        const content = readFileSync(filePath, 'utf8');
        const variant = parse(content) as BuildVariant;

        if (variant && typeof variant === 'object') {
          variants[variantName] = variant;
        }
      }
    }

    if (Object.keys(variants).length === 0) {
      throw new Error('No build variants found in build/ directory');
    }

    return {
      variants,
      default_variant: 'full',
      fallback_variant: 'minimal',
    };
  } catch (error) {
    console.error('❌ Error loading build configuration:', error);
    throw error;
  }
}

/**
 * Create a variant configuration by filtering the full config based on variant specifications
 */
export function createVariantConfig(fullConfig: YamlConfig, variant: BuildVariant): YamlConfig {
  const result: YamlConfig = {};

  // Copy main configuration properties based on include settings
  Object.keys(fullConfig).forEach(key => {
    switch (key) {
      case 'blocks':
        // Handle blocks separately based on include settings
        if (variant.include.left_prompt || variant.include.right_prompt) {
          result[key] = filterBlocks(fullConfig[key], variant);
        }
        break;

      case 'tooltips':
        // Include tooltips only if specified
        if (variant.include.tooltips) {
          result[key] = fullConfig[key];
        }
        break;

      case 'palette':
        // Include palette if specified (usually always included)
        if (variant.include.palette !== false) {
          result[key] = fullConfig[key];
        }
        break;

      case 'transient_prompt':
        // Include transient prompt if specified
        if (variant.include.transient !== false) {
          result[key] = fullConfig[key];
        }
        break;

      default:
        // Include main config properties by default unless explicitly excluded
        if (variant.include.main_config !== false) {
          result[key] = fullConfig[key];
        }
        break;
    }
  });

  return result;
}

/**
 * Filter blocks based on variant specifications
 */
function filterBlocks(blocks: unknown, variant: BuildVariant): unknown {
  if (!Array.isArray(blocks)) {
    return blocks;
  }

  const filteredBlocks = blocks
    .filter((block: unknown) => {
      if (!block || typeof block !== 'object') {
        return true;
      }

      const blockObj = block as { type?: string; newline?: boolean };

      // Filter based on block type (prompt vs rprompt)
      if (blockObj.type === 'rprompt' && !variant.include.right_prompt) {
        return false;
      }

      if (blockObj.type === 'prompt' && !variant.include.left_prompt) {
        return false;
      }

      // Filter out newline blocks if excluded
      if (blockObj.newline === true && variant.exclude?.newline_blocks === true) {
        return false;
      }

      return true;
    })
    .map((block: unknown) => {
      if (!block || typeof block !== 'object') {
        return block;
      }

      const blockObj = block as { segments?: unknown[] };

      // Filter segments within blocks if needed
      if (blockObj.segments && Array.isArray(blockObj.segments) && variant.exclude?.segments) {
        const filteredSegments = blockObj.segments.filter((segment: unknown) => {
          if (!segment || typeof segment !== 'object') {
            return true;
          }

          const segmentObj = segment as { type?: string };
          if (!segmentObj.type) {
            return true;
          }

          // Check if this segment type should be excluded
          return !variant.exclude?.segments?.includes(segmentObj.type);
        });

        return {
          ...blockObj,
          segments: filteredSegments,
        };
      }

      return block;
    });

  return filteredBlocks;
}

/**
 * Get list of all available variants
 */
export function getAvailableVariants(): string[] {
  const config = loadBuildConfig();
  return Object.keys(config.variants);
}

/**
 * Get variant configuration by name
 */
export function getVariant(name: string): BuildVariant {
  const config = loadBuildConfig();
  const variant = config.variants[name];

  if (!variant) {
    throw new Error(`Variant '${name}' not found in build configuration`);
  }

  return variant;
}

/**
 * Get default variant name
 */
export function getDefaultVariant(): string {
  const config = loadBuildConfig();
  return config.default_variant;
}

/**
 * Get fallback variant name
 */
export function getFallbackVariant(): string {
  const config = loadBuildConfig();
  return config.fallback_variant;
}
