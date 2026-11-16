// src/routes/linkedAccountsIndex.js — composes list + connect + unlink onto one router
'use strict';

const { router } = require('./linkedAccounts');
const { registerConnect } = require('./linkedAccountsConnect');
const { registerUnlink } = require('./linkedAccountsUnlink');

registerConnect(router);
registerUnlink(router);

module.exports = router;
