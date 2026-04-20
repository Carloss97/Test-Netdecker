const handler = require('../../_api_handlers/inventory/imports.cjs');
module.exports = async function (req, res) {
  return handler(req, res);
};
