'use strict';

// Compatibility barrel. New tests should import the narrow helper that owns
// their concern; existing specs can migrate without changing behavior.
module.exports = {
  ...require('./vendorOverrides'),
  ...require('./workspaceDriver'),
  ...require('./diagnostics')
};
