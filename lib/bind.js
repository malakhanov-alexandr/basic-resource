
module.exports = bindResource;

function bindResource(app, resource, options) {

  var prefix = options.context + '/',
    lastPathIndex = resource.path.length - 1,
    lastPathName = resource.path[lastPathIndex];

  for (var i = 0; i < lastPathIndex; i++) {
    prefix += resource.path[i] + '/';
    if (i === 0 || resource.type !== "ref") {
      prefix += ':' + resource.ids[i] + '/';
    }
  }

  resource.pathPrefix = prefix;

  var allPath = prefix + lastPathName;
  if (resource.controller.index) {
    app.route(allPath).get(function (req, res) {
      resource.controller.index(req, res);
    });
  }
  if (resource.controller.create) {
    app.route(allPath).post(function (req, res) {
      resource.controller.create(req, res);
    });
  }
  var onePath = prefix + lastPathName + '/:' + resource.ids[lastPathIndex];
  if (resource.controller.one) {
    app.route(onePath).get(function (req, res) {
      resource.controller.one(req, res);
    });
  }
  if (resource.controller.update) {
    app.route(onePath).put(function (req, res) {
      resource.controller.update(req, res);
    });
  }
  if (resource.controller.remove) {
    app.route(onePath).delete(function (req, res) {
      resource.controller.remove(req, res);
    });
  }

  return resource;

}

