const handler = require('../../_api_handlers/admin/price-volatility.cjs');
module.exports = async function (req, res) {
  return handler(req, res);
};
