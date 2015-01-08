var errors = require("./errors.js");
var helper = require("./helper.js");
var Q = require("q");

module.exports = Resource;

function Resource(model, schema, path, options) {
  var resource = this;
  resource.model = model;
  resource.schema = schema;
  resource.type = options.type ? options.type : "normal";
  resource.children = [];
  resource.path = path;
  resource.names = [schema.name];
  resource.requiredParamsCount = 1;
  resource.helper = new helper(resource, options);
  var parent = options.parent;
  if (parent) {
    var current = resource;
    while (current.parent) {
      current = current.parent;
      if (current.type === "sub") {
        ++resource.requiredParamsCount;
      }
    }
    resource.path = parent.path.concat(this.path);
    resource.names = parent.names.concat(this.names);
    resource.parent = parent;
    parent.children.push(this);
  }
  resource.ids = [];
  resource.names.forEach(function (name) {
    resource.ids.push(name + "Id");
  });
  resource.name = schema.name;

  var prefix = options.context + '/',
    lastPathIndex = resource.path.length - 1;
  for (var i = 0; i < lastPathIndex; i++) {
    prefix += resource.path[i] + '/';
    if (i === 0 || resource.type !== "ref") {
      prefix += ':' + resource.ids[i] + '/';
    }
  }
  resource.pathPrefix = prefix;
  
  resource.closestModelResource = function () {
    var current = resource, i = 0;
    while (current.parent && !current.model) {
      current = current.parent;
      ++i;
    }
    return current;
  };
  resource.closestParentModelResource = function () {
    var current = resource, i = 0;
    do {
      current = current.parent;
      ++i;
    } while (current.parent && !current.model);
    return current;
  };
  switch (resource.type) {

    case "sub":
    {

      resource.getParentDoc = function (params) {
        return resource.parent.getOne(params);
      };
      resource.getAll = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.getParentDoc(params).then(function (parentDoc) {
            resolve(parentDoc[resource.fieldName]);
          });
        });
      };
      resource.getOne = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.getAll(params.slice(0, -1), req).then(function (result) {
            var doc = result.id(params[params.length - 1]);
            if (!doc) {
              reject(new errors.NotFoundError(resource.schema.name));
            }
            resolve(doc);
          }).fail(function (err) {
            reject(err);
          });
        });
      };
      break;
    }
    case "ref":
    {
      resource.getOne = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.parent.getOne(params, req).then(function (parentDoc) {
            resource.model.findById(parentDoc[options.refName ? (options.refName + "Id") : resource.ids[resource.ids.length - 1]], function (err, doc) {
              if (!doc) {
                reject(new errors.NotFoundError(resource.schema.name));
              }
              resolve(doc);
            });
          }).fail(function (err) {
            reject(err);
          });
        });
      };
      break;
    }
    case "subRef":
    {
      resource.getAll = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.parent.getOne(params, req).then(function (parentDoc) {
            resource.model.find({_id: {$in: parentDoc[resource.fieldName]}}, function (err, result) {
              resolve(result);
            });
          });
        });
      };
      break;
    }
    case "backRef":
    {

      break;
    }
    default:
    {
      resource.getAll = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.model.find({}, function (err, doc) {
            if (err) {
              reject(err);
            } else {
              resolve(doc);
            }
          });
        });
      };
      resource.getOne = function (params, req) {
        return Q.Promise(function (resolve, reject) {
          resource.helper.filterQuery(req, {_id: params[0]}).then(function (query) {
            resource.model.findOne(query, function (err, doc) {
              if (err) {
                reject(err);
              } else if (!doc) {
                resource.helper.handleError(res, new errors.NotFoundError());
              } else {
                resolve(doc);
              }
            });
          }).fail(function () {
            resource.helper.handleError(res, new errors.Forbidden());
          });
        });
      };
      resource.saveOne = function (data) {
        return Q.Promise(function (resolve, reject) {
          var doc;
          try {
            doc = new resource.model(data);
          } catch (ex) {
            ex.code = 400;
            return reject(ex);
          }
          doc.save(function (err, doc) {
            if (err) {
              err.code = 400;
              return reject(err);
            }
            return resolve(doc);
          });
        });
      };
      break;
    }
  }
}


