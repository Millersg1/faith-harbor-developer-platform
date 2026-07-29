// Copies non-TS web assets (favicons, web manifest) into dist after tsc, which
// only emits compiled JS. Keeps the platform app self-contained so the icons
// deploy alongside dist. Cross-platform (fs.cpSync works on Windows + Linux).
import {
  cpSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import {
  dirname,
  join,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(
  dirname(fileURLToPath(import.meta.url)),
);
const src = join(
  root,
  "src/platform/web/public",
);
const dest = join(
  root,
  "dist/platform/web/public",
);

if (existsSync(src)) {
  mkdirSync(dirname(dest), {
    recursive: true,
  });
  cpSync(src, dest, {
    recursive: true,
  });
  console.log(
    "copied web assets ->",
    dest,
  );
} else {
  console.log(
    "no web assets to copy",
  );
}
