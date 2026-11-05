import { createRequire } from 'node:module';

interface PackageInfo {
  version: string;
  description: string;
  author: { name: string; url: string };
  repository: { url: string };
  license: string;
}

/**
 * Read at runtime instead of imported: an import would make TypeScript pull
 * package.json into the compiled output. This file sits one folder below the
 * package root both in src/ and in the published lib/.
 */
export const pkg = createRequire(import.meta.url)('../package.json') as PackageInfo;
