import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

// Read version from package.json for consistency
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version || '0.0.0';
mkdirSync('dist', { recursive: true });
mkdirSync('bubble-html', { recursive: true });

// 1) bundle IIFE que expõe window.Statz
await build({
  entryPoints: ['index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  charset: 'utf8',           // keep non-ASCII characters unescaped
  legalComments: 'none',     // strip license/comments
  sourcemap: false,
  outfile: 'dist/statz-core.js'
});

// 2) versionar com hash para cache-busting
let code = readFileSync('dist/statz-core.js', 'utf8');
// Extra safety for inline usage: escape </script>, collapse newlines, and trim spaces between HTML tags in strings
code = code
  .replace(/<\//g, '<\\/')
  .replace(/[\n\r]+/g, '')
  .replace(/>\s+</g, '><');
const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
const outFile = `dist/statz-core.v${version}.${hash}.js`;
writeFileSync(outFile, code);

// 3) gerar saída HTML inline (para colar no Bubble free)
const htmlOut = `<!-- statz bundle (v${version}, ${hash}) --><script>${code};(function(){try{var ns=(window.Statz||window.Utils);if(ns&&(ns.initDeps||(ns.loadDeps&&ns.loadStdlibStats))){var p=ns.initDeps?ns.initDeps():ns.loadDeps().then(function(){return ns.loadStdlibStats()});p.then(function(){try{console.log('Stat-z ready:',(ns.health?ns.health():{}))}catch(e){}}).catch(console.error)}else{console.warn('Stat-z: loader functions not found')}}catch(e){console.error(e)}})();</script>`;
writeFileSync('bubble-html/statz-bundle.html', htmlOut);

console.log('Build OK:', outFile, 'and bubble-html/statz-bundle.html');

