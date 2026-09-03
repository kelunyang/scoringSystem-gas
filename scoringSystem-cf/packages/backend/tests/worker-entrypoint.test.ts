/**
 * Guards on what the Worker entry point must export.
 *
 * These are static checks on purpose. The failure they catch —
 * `export { NotificationHub }` going missing from src/index.ts — slips past
 * every other gate: tsc sees no error (nothing references the export),
 * the bundle builds, `wrangler deploy --dry-run` does not validate Durable
 * Object classes, and no unit test touches the entry point. It only surfaces
 * at real deploy time, as:
 *
 *   New version of script does not export class 'NotificationHub' which is
 *   depended on by existing Durable Objects [code: 10064]
 *
 * That happened on 2026-09-04 while removing dead code, so it is now a test.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const wranglerToml = readFileSync(resolve(ROOT, 'wrangler.toml'), 'utf-8');
const entrypoint = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf-8');

/** Class names wrangler.toml binds as Durable Objects. */
function declaredDurableObjectClasses(): string[] {
  return [...wranglerToml.matchAll(/^\s*class_name\s*=\s*["']([^"']+)["']/gm)]
    .map(m => m[1]);
}

/** Queue names wrangler.toml declares a consumer for. */
function declaredConsumerQueues(): string[] {
  const consumerBlocks = wranglerToml.split('[[queues.consumers]]').slice(1);
  return consumerBlocks
    .map(block => block.match(/^\s*queue\s*=\s*["']([^"']+)["']/m)?.[1])
    .filter((q): q is string => Boolean(q));
}

describe('worker entrypoint exports', () => {
  it('exports every Durable Object class bound in wrangler.toml', () => {
    const declared = declaredDurableObjectClasses();
    expect(declared.length).toBeGreaterThan(0);

    const missing = declared.filter(
      className => !new RegExp(`export\\s*\\{[^}]*\\b${className}\\b[^}]*\\}`).test(entrypoint)
    );

    expect(missing, `src/index.ts must export: ${missing.join(', ')}`).toEqual([]);
  });

  it('routes every queue that has a consumer configured', () => {
    // A queue with a consumer but no case in the router throws
    // "Unknown queue" at runtime, and only for messages that actually arrive.
    const missing = declaredConsumerQueues().filter(
      queue => !entrypoint.includes(`case '${queue}'`)
    );

    expect(missing, `index.ts queue router is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not route queues that no longer have a consumer configured', () => {
    // The mirror of the check above: a leftover case for a deleted queue is
    // dead code that looks live.
    const configured = declaredConsumerQueues();
    const routed = [...entrypoint.matchAll(/case '([a-z-]+-queue)':/g)].map(m => m[1]);

    const orphaned = routed.filter(queue => !configured.includes(queue));
    expect(orphaned, `index.ts routes queues with no consumer: ${orphaned.join(', ')}`).toEqual([]);
  });
});
