// Node-side stand-in for the `@stdlib/stats` umbrella namespace.
//
// Importing `@stdlib/stats` pulls the WHOLE stdlib stats namespace eagerly:
// ~3.7k CommonJS modules resolved and read at startup, on top of the ~38k files
// the @stdlib tree puts in node_modules. On a native filesystem that costs a few
// seconds; when node_modules lives on a Windows drive mounted into WSL (`/mnt/c`,
// drvfs) every stat/open crosses the VM boundary and the same import takes
// minutes — long enough to look like a hang.
//
// The library only ever touches a handful of entry points, so this assembles the
// namespace from those subpaths instead (~1k modules). The list is imported from
// loader.js rather than restated here, so the Node and browser paths cannot drift.

import { createRequire } from 'node:module';
import { STDLIB_STATS_PARTS, STDLIB_CHISQUARE_CDF } from '../../loader.js';

// `createRequire` rather than `import`: stdlib subpackages ship no `exports` map
// and their entry point is a bare `lib/` directory, which ESM refuses to resolve
// on a subpath (ERR_UNSUPPORTED_DIR_IMPORT). CJS resolution handles it, and the
// umbrella package was being loaded through the same legacy path anyway.
const require = createRequire(import.meta.url);

/** @type {Record<string, any>} */
const stdlibStats = {
  base: {
    dists: {
      chisquare: { cdf: require(`@stdlib/stats/${STDLIB_CHISQUARE_CDF}`) }
    }
  }
};

for (const [name, subpath] of Object.entries(STDLIB_STATS_PARTS)) {
  stdlibStats[name] = require(`@stdlib/stats/${subpath}`);
}

export default stdlibStats;
