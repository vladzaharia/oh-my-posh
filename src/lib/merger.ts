import deepmerge from 'deepmerge';
import type { YamlConfig } from '../types/index.js';

/**
 * Custom merge function for arrays - concatenate instead of replacing
 */
function mergeArrays(target: unknown[], source: unknown[]): unknown[] {
  return [...target, ...source];
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
