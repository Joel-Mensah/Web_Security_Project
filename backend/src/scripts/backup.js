'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { createCloudBackup } = require('../services/cloudBackupService');

if (require.main === module) {
  (async () => {
    try {
      const backup = await createCloudBackup();
      console.log(`[BACKUP] Encrypted backup saved to configured cloud storage: ${backup.name}`);
    } catch (err) {
      console.error('[BACKUP] Fatal:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { createCloudBackup };
