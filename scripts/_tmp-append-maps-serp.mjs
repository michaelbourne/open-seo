import { execSync } from "node:child_process";
import fs from "node:fs";

const backup = execSync(
  "git show wip/agency-local-seo-backup:src/server/lib/dataforseo/serp.ts",
  { encoding: "utf8" },
);
const marker =
  "// ---------------------------------------------------------------------------\n// Maps grid rank";
const idx = backup.indexOf(marker);
if (idx < 0) throw new Error("marker not found");
const maps = backup.slice(idx);

const path = "src/server/lib/dataforseo/serp.ts";
let cur = fs.readFileSync(path, "utf8");
if (cur.includes("postMapsRankTasks")) {
  console.log("already present");
  process.exit(0);
}

cur = cur.replace(
  "SerpGoogleMapsLiveAdvancedRequestInfo,",
  "SerpGoogleMapsLiveAdvancedRequestInfo,\n  SerpGoogleMapsTaskPostRequestInfo,",
);

if (!cur.includes("matchMapsResultRank")) {
  cur = cur.replace(
    'import { AppError } from "@/server/lib/errors";',
    [
      'import { AppError } from "@/server/lib/errors";',
      'import { matchMapsResultRank } from "@/shared/local-map-rank";',
      'import { formatLocationCoordinate } from "@/shared/grid-pins";',
    ].join("\n"),
  );
}

fs.writeFileSync(path, `${cur.trimEnd()}\n\n${maps}`);
console.log("appended maps section, bytes", maps.length);
