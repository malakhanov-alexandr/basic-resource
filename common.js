var underscore = require("underscore");

module.exports.handleError = function handleError(res, message, code) {
  res.statusCode = code || 500;
  return res.json({
    status: res.statusCode,
    message: message
  });
};

module.exports.handleSuccess = function (res, data, extra) {
  var result = underscore.extend({status: 200, message: "success"}, extra);
  if (data) {
    result.data = data;
  }
  return res.json(result);
};

module.exports.handleNoParam = function (res, paramName) {
  return module.exports.handleError(res, "Parameter " + paramName + " is required", 400);
};

