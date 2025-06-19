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
  const promptNewlineSegments: unknown[] = [];
  const rightPromptSegments: unknown[] = [];

  configs.forEach(config => {
    if (config['blocks'] && Array.isArray(config['blocks'])) {
      config['blocks'].forEach((block: unknown) => {
        const blockObj = block as Record<string, unknown>;
        if (
          blockObj['type'] === 'prompt' &&
          blockObj['alignment'] === 'left' &&
          Array.isArray(blockObj['segments']) &&
          !blockObj['newline'] // Only merge first line left prompts
        ) {
          promptSegments.push(...(blockObj['segments'] as unknown[]));
        } else if (
          blockObj['type'] === 'prompt' &&
          blockObj['alignment'] === 'left' &&
          Array.isArray(blockObj['segments']) &&
          blockObj['newline'] === true // Merge second line left prompts
        ) {
          promptNewlineSegments.push(...(blockObj['segments'] as unknown[]));
        } else if (
          ((blockObj['type'] === 'rprompt' && blockObj['alignment'] === 'right') ||
            (blockObj['type'] === 'prompt' && blockObj['alignment'] === 'right')) &&
          Array.isArray(blockObj['segments'])
        ) {
          rightPromptSegments.push(...(blockObj['segments'] as unknown[]));
        } else {
          // Keep other block types as-is (including blocks with other newline configurations)
          allBlocks.push(block);
        }
      });
    }
  });

  // Create consolidated blocks in correct order
  // 1. First line left prompt
  if (promptSegments.length > 0) {
    allBlocks.push({
      type: 'prompt',
      alignment: 'left',
      segments: promptSegments,
    });
  }

  // 2. Right prompt (on same line as left prompt)
  if (rightPromptSegments.length > 0) {
    allBlocks.push({
      type: 'prompt',
      alignment: 'right',
      overflow: 'hide',
      segments: rightPromptSegments,
    });
  }

  // 3. Second line left prompt (after right prompt)
  if (promptNewlineSegments.length > 0) {
    allBlocks.push({
      type: 'prompt',
      alignment: 'left',
      newline: true,
      segments: promptNewlineSegments,
    });
  }

  if (allBlocks.length > 0) {
    merged['blocks'] = allBlocks;
  }

  return merged;
}
