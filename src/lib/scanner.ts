import { glob } from 'glob';
import type { ListrTaskWrapper, ListrRendererFactory } from 'listr2';
import type { TaskContext } from '../types/index.js';

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
