import { readFileSync } from 'fs';
import { parse } from 'yaml';
import type { ListrTaskWrapper, ListrRendererFactory } from 'listr2';
import type { YamlConfig, TaskContext } from '../types/index.js';

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
