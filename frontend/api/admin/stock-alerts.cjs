const handler = require('../../_api_handlers/admin/stock-alerts.cjs');
module.exports = async function (req, res) {
  return handler(req, res);
};
