import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The studio reads a fiction as its OWNER, never through the public path.
 *
 * `fetchNovel` asks the public endpoint first and falls back to the
 * authenticated one. For a DRAFT the public path 404s and the fallback runs, so
 * everything looked fine in testing - but the moment a writer published, the
 * public path started succeeding and answering with the GUEST view:
 * `is_owner: false`, no `can_edit`. The studio layout's ownership check then
 * served the author a 404 for their own published story, and only for the
 * stories they had published. It read exactly like "my old links broke".
 *
 * The rule is therefore mechanical: nothing under app/studio may call
 * `fetchNovel`. This test is the rule, because the failure is invisible until
 * something is published and then silently deletes a writer's access to their
 * own work.
 */

const ROOT = join(__dirname, "..", "..");
const STUDIO = join(ROOT, "app", "studio");

function studioFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) studioFiles(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("the studio's fiction read", () => {
  it("never uses the public-first fetch", () => {
    const offenders: string[] = [];
    for (const file of studioFiles(STUDIO)) {
      const body = readFileSync(file, "utf8");
      // `fetchOwnerNovel` contains the substring, so match the call itself.
      if (/\bfetchNovel\s*\(/.test(body) || /\bfetchNovel\s*,/.test(body)) {
        offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has an owner fetch that carries the writer's session", () => {
    const source = readFileSync(join(ROOT, "lib", "fiction-server.ts"), "utf8");
    expect(source).toMatch(/export const fetchOwnerNovel/);
    // The owner read must go through the authenticated helper only. If this
    // ever gains a serverGetPublic call, it has become fetchNovel again.
    const body = source.slice(source.indexOf("export const fetchOwnerNovel"));
    const definition = body.slice(0, body.indexOf("\n);") + 3);
    expect(definition).toContain("serverGetOne");
    expect(definition).not.toContain("serverGetPublic");
  });

  it("still lets reader pages use the cacheable public-first fetch", () => {
    // The public path is right for /novel and /read: those pages are the same
    // for every visitor and must stay cacheable (docs/14 §7). This test exists
    // so the fix above is not "over-applied" into a performance regression.
    const reader = readFileSync(
      join(ROOT, "app", "novel", "[slug]", "page.tsx"),
      "utf8",
    );
    expect(reader).toMatch(/\bfetchNovel\b/);
  });
});
