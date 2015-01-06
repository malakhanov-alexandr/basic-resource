
exports.Forbidden = function Forbidden() {
  var tmp = Error.call(this, "Forbidden");
  this.message = tmp.message;
  tmp.name = this.name = 'Forbidden';
  tmp.code = this.code = 403;
  Object.defineProperty(this, 'stack', {
    get: function () {
      return tmp.stack
    }
  });
  return this;
};

exports.NotFoundError = function NotFoundError(modelName) {
  var tmp = Error.call(this, modelName + " not found");
  this.message = tmp.message;
  tmp.name = this.name = 'NotFoundError';
  tmp.code = this.code = 404;
  Object.defineProperty(this, 'stack', {
    get: function () {
      return tmp.stack
    }
  });
  return this;
};



