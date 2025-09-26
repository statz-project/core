import { parseFixture } from './load-fixture.mjs';

const { parsed } = parseFixture();

console.log("Database data:")
console.log(JSON.stringify(parsed));
