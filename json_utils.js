// Aggregate JSON-related utilities from modular files
import driver from './json/driver.js';
import exporters from './json/exporters.js';
import i18n from './i18n/index.js';

const ns = {
  ...driver,
  ...exporters,
  ...i18n
};

export default ns;
