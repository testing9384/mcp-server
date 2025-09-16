import path from 'path';
import os from 'os';

/**
 * Normalizes a file path by resolving . and .. segments and converting to forward slashes
 */
export function normalizePath(filepath: string): string {
  return path.resolve(filepath).replace(/\\/g, '/');
}

/**
 * Expands ~ in file paths to the user's home directory
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}