
module.exports = bindResource;

function bindResource(app, resource, options) {

  var lastPathIndex = resource.path.length - 1,
    lastPathName = resource.path[lastPathIndex];


  var allPath = resource.pathPrefix + lastPathName;
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
  var onePath = resource.pathPrefix + lastPathName + '/:' + resource.ids[lastPathIndex];
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

