
exports.NotFoundError = function NotFoundError() {
  var tmp = Error.apply(this, arguments);
  tmp.name = this.name = 'NotFoundError';
  this.message = tmp.message;
  Object.defineProperty(this, 'stack', {
    get: function () {
      return tmp.stack
    }
  });
  return this;
};



