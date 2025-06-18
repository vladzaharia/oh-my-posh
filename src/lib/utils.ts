import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get the repository root directory by walking up the directory tree
 * looking for package.json
 */
export function getRepoRoot(): string {
  // Find the directory containing package.json by walking up from current file
  let currentDir = import.meta.url.replace('file://', '');
  currentDir = currentDir.substring(0, currentDir.lastIndexOf('/'));
  
  while (currentDir !== '/') {
    try {
      const packageJsonPath = join(currentDir, 'package.json');
      readFileSync(packageJsonPath, 'utf8');
      return currentDir;
    } catch {
      currentDir = currentDir.substring(0, currentDir.lastIndexOf('/'));
    }
  }
  
  // Fallback to process.cwd() if package.json not found
  return process.cwd();
}
