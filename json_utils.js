// Aggregate JSON-related utilities from modular files
import driver from './json/driver.js';
import exporters from './json/exporters.js';
import optionsMetadata from './json/options_metadata.js';
import snapshots from './json/snapshots.js';
import i18n from './i18n/index.js';

const ns = {
  ...driver,
  ...exporters,
  ...optionsMetadata,
  ...snapshots,
  ...i18n
};

export default ns;
