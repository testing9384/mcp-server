import path from 'path';
import { normalizePath } from './path-utils.js';

/**
 * Checks if a given path is within any of the allowed directories
 * @param targetPath The path to check (should be normalized)
 * @param allowedDirectories Array of allowed directory paths (should be normalized)
 * @returns true if the path is within an allowed directory, false otherwise
 */
export function isPathWithinAllowedDirectories(targetPath: string, allowedDirectories: string[]): boolean {
  const normalizedTarget = normalizePath(targetPath);
  
  for (const allowedDir of allowedDirectories) {
    const normalizedAllowed = normalizePath(allowedDir);
    
    // Check if the target path starts with the allowed directory path
    // Add trailing slash to prevent partial directory name matches
    const allowedWithSlash = normalizedAllowed.endsWith('/') ? normalizedAllowed : normalizedAllowed + '/';
    const targetWithSlash = normalizedTarget.endsWith('/') ? normalizedTarget : normalizedTarget + '/';
    
    // Allow exact match or subdirectory match
    if (normalizedTarget === normalizedAllowed || targetWithSlash.startsWith(allowedWithSlash)) {
      return true;
    }
  }
  
  return false;
}