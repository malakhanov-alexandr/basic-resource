var underscore = require("underscore");
var common = require("./common.js");
var mongoose = require("mongoose");
var errors = require("./errors.js");
var Q = require("q");

var defaultOptions = {};
var defaultGetParams = [{
  name: "fields",
  paramType: "query"
}, {
  name: "start",
  paramType: "query"
}, {
  name: "length",
  paramType: "query"
}];

function Resource(model, schema, path, type, parent) {
  var resource = this;
  resource.model = model;
  resource.schema = schema;
  resource.path = path;
  resource.names = [];
  resource.ids = [];
  resource.path.forEach(function (resourceName) {
    var name = resourceName.replace(/s$/, "");
    resource.names.push(name);
    resource.ids.push(name + "Id");
  });
  resource.type = type ? type : "normal";
  resource.children = [];
  if (parent) {
    resource.path = parent.path.concat(this.path);
    resource.parent = parent;
    resource.model = parent.model;
    parent.children.push(this);
  }
}

function ResourceController(resource, options) {
  var controller = {};

  switch (resource.type) {


    default:
    {

      controller.index = function (req, res) {
        var constraints = getQueryConstraints(req);
        resource.model.find(constraints, getLimitOptions(req), getQueryOptions(req)).lean().exec(function (err, result) {
          if (err) {
            return common.handleError(res, err, 400);
          }
          if (req.query.draw) {
            result.draw = req.query.draw;
          }
          resource.model.count(function (err, totalCount) {
            resource.model.count(constraints, function (err, count) {
              return common.handleSuccess(res, format(result, null), {
                recordsFiltered: count,
                recordsTotal: totalCount
              });
            });
          });
        });
      };

      controller.one = function (req, res) {
        checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            resource.model.findById(params[0], getLimitOptions(req)).lean().exec(function (err, doc) {
              if (err) {
                err.code = 400;
                reject(err);
              } else {
                resolve(doc);
              }
            });
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.model.modelName));
            }
            var formatted = formatOne(doc, null);
            if (!formatted) {
              return reject(new errors.Forbidden());
            }
            common.handleSuccess(res, formatted);
            resolve(doc);
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      controller.create = function (req, res) {
        validate(req.body).then(function (data) {
          return Q.Promise(function (resolve, reject) {
            var doc;
            try {
              doc = new resource.model(data);
            } catch (ex) {
              ex.code = 400;
              return reject(ex);
            }
            resolve(doc);
          });
        }).then(function (doc) {
          return saveDoc(res, doc);
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      controller.update = function (req, res) {
        checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            model.findById(params[0], function (err, doc) {
              if (err) {
                err.code = 400;
                reject(err);
              } else {
                resolve(doc);
              }
            });
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              reject(new errors.NotFoundError(resource.model.modelName));
            } else {
              resolve(doc);
            }
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            validate(req.body).then(function (data) {
              saveDoc(res, underscore.extend(doc, data)).then(function (doc) {
                resolve(doc);
              }).fail(function (err) {
                reject(err);
              });
            }).fail(function (err) {
              reject(err);
            });
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      controller.remove = function (req, res) {
        checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            model.findOneAndRemove({_id: params[0]}, function (err, doc) {
              if (err) {
                err.code = 400;
                reject(err);
              } else {
                resolve(doc);
              }
            });
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              reject(new errors.NotFoundError(resource.model.modelName));
            } else {
              common.handleSuccess(res);
              resolve(doc);
            }
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      break;
    }

  }

  return controller;


  function getQueryOptions(req) {
    var queryOptions = {};
    if (req.query.start) {
      queryOptions.skip = req.query.start;
    }
    if (req.query.length) {
      queryOptions.limit = req.query.length;
    }
    if (req.query.order) {
      queryOptions.sort = {};
      req.query.order.forEach(function (order) {
        queryOptions.sort[req.query.columns[order.column].data] = order.dir === "desc" ? -1 : 1;
      });
    }
    return queryOptions;
  }

  function getQueryConstraints(req) {
    var constraints = {};
    if (req.query.search && req.query.search.value && req.query.columns) {
      var search = constraints.$or = [];
      req.query.columns.forEach(function (field) {
        var name = field.data;
        if (resource.schema.tree[name] && resource.schema.tree[name].type && resource.schema.tree[name].type.name === "String") {
          var fieldSearch = {};
          fieldSearch[name] = new RegExp(req.query.search.value, "i");
          search.push(fieldSearch);
        }
      });
    }
    return constraints;
  }

  function getLimitOptions(req) {
    var fields = {};
    if (typeof req.query.fields === "string") {
      req.query.fields.split(/,\s*/).forEach(function (field) {
        if (typeof resource.schema.paths[field] !== "undefined") {
          fields[field] = 1;
        }
      });
    }
    return fields;
  }

  /**
   * Require path parameter to exist
   * @param req Request
   * @param res Result
   * @param paramsCount Limits count of checked parameters
   */
  function checkParams(req, res, paramsCount) {
    return Q.Promise(function (resolve, reject) {
      var params = [];
      for (var i = 0; i < paramsCount; i++) {
        var param = req.params[resource.ids[i]];
        if (!param) {
          return common.handleNoParam(res, resource.ids[i]);
        }
        params.push(param);
      }
      resolve(params);
    });
  }


  function handleError(res, err) {
    return common.handleError(res, err.message, err.code);
  }

  function handleNotFound(res, modelName) {
    return common.handleError(res, (modelName ? modelName : resource.model.modelName) + " not found", 404);
  }

  /**
   * Limit document props
   * @param document Document to limit
   * @param fields Fields limit config {@see getFieldLimitOptions}
   * @returns {*} limit result
   */
  function limitDocument(document, fields) {
    if (!fields) {
      return document;
    }
    var keys = underscore.keys(fields);
    if (!keys.length) {
      return document;
    }
    keys.unshift("_id");
    return underscore.pick(document, keys);
  }

  /**
   * Format document (calls options.format)
   * @param document Document to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} format result
   */
  function formatOne(document, fields) {
    return limitDocument(typeof options.format === "function" ? options.format(document) : document, fields);
  }

  /**
   * Format list of documents (calls options.format and will exclude bad format results from list)
   * @param documents Items list to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {Array} list format result
   */
  function format(documents, fields) {
    var resultItems = [];
    documents.forEach(function (item) {
      var filtered = formatOne(item, fields);
      if (filtered) {
        resultItems.push(filtered);
      }
    });
    return resultItems;
  }

  /**
   * Save document
   * @param res Request
   * @param doc Mongoose document
   */
  function saveDoc(res, doc) {
    return Q.Promise(function (resolve, reject) {
      doc.save(function (err, doc) {
        if (err) {
          common.handleError(res, err, 400);
          return reject(err);
        }
        common.handleSuccess(res, doc);
        return resolve(doc);
      });
    });
  }

  /**
   * Validate value object (calling options.validate and handles errors)
   * @param res Resule
   * @param body Value object
   * @returns {*} Validated value object
   */
  function validate(body) {
    return Q.Promise(function (resolve, reject) {
      var data = body;
      if (typeof options.validate === "function") {
        try {
          data = options.validate(data);
        } catch (ex) {
          ex.code = 400;
          return reject(ex);
        }
      }
      if (data) {
        return resolve(data);
      } else {
        return reject(new errors.Forbidden());
      }
    });
  }


}

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

function getResourceOperations(resource) {
  var summary, operations = [],
    summaryPostfix = "",
    pathParams = [],
    lastPathIndex = resource.path.length - 1,
    lastPathName = resource.path[lastPathIndex];

  for (var i = 0; i < lastPathIndex; i++) {
    summaryPostfix += resource.path[i];
    if (i === 0 || resource.type !== "ref") {
      pathParams.push({
        name: resource.ids[i],
        required: true,
        paramType: "path"
      });
      summaryPostfix += "[" + resource.ids[i] + "]";
    }
    if (i < lastPathIndex - 1) {
      summaryPostfix += ".";
    }
  }

  var modelParams = underscore.filter(underscore.map(resource.schema.paths, function (options, name) {
    return {
      name: name,
      required: !!options.isRequired,
      paramType: "form"
    }
  }), function (param) {
    return !param.name.match(/^_/);
  });

  var combinedParams = pathParams.concat(modelParams);

  var pathPrefix = resource.pathPrefix.replace(/:([^\/]+)/g, "{$1}");

  var allPath = pathPrefix + lastPathName;
  if (resource.controller.index) {
    if (resource.type === "sub") {
      summary = "Get all " + lastPathName + " from " + summaryPostfix;
    } else if (resource.type === "ref") {
      summary = "Get " + lastPathName + " referenced by " + summaryPostfix;
    } else if (resource.type === "backRef") {
      summary = "Get all " + lastPathName + " referenced by " + summaryPostfix;
    } else {
      summary = "Get all " + lastPathName;
    }
    operations.push({
      path: allPath,
      operations: [{
        method: "GET",
        summary: summary,
        parameters: underscore.map(pathParams.concat(defaultGetParams), function (param) {
          return underscore.clone(param);
        }),
        nickname: getOperationNickName(allPath) + "_index"
      }]
    });
  }
  if (resource.controller.create) {
    if (resource.type === "sub") {
      summary = "Create new " + lastPathName.replace(/s$/, "") + " in " + summaryPostfix;
    } else {
      summary = "Create new " + lastPathName.replace(/s$/, "");
    }
    operations.push({
      path: allPath,
      operations: [{
        method: "POST",
        summary: summary,
        parameters: underscore.map(combinedParams, function (param) {
          return underscore.clone(param);
        }),
        nickname: getOperationNickName(allPath) + "_create"
      }]
    });
  }
  var onePath = pathPrefix + lastPathName + '/{' + resource.ids[lastPathIndex] + "}";
  var onePathParams = underscore.clone(pathParams);
  onePathParams.push({
    name: resource.ids[lastPathIndex],
    required: true,
    paramType: "path"
  });
  if (resource.controller.one) {
    if (resource.type === "sub") {
      summary = "Get one " + lastPathName.replace(/s$/, "") + " in " + summaryPostfix;
    } else {
      summary = "Get one " + lastPathName.replace(/s$/, "");
    }
    operations.push({
      path: onePath,
      operations: [{
        method: "GET",
        summary: summary,
        parameters: underscore.map(onePathParams, function (param) {
          return underscore.clone(param);
        }),
        nickname: getOperationNickName(onePath) + "_one"
      }]
    });
  }
  if (resource.controller.update) {
    if (resource.type === "sub") {
      summary = "Save " + lastPathName.replace(/s$/, "") + " in " + summaryPostfix;
    } else {
      summary = "Save " + lastPathName.replace(/s$/, "");
    }
    operations.push({
      path: onePath,
      operations: [{
        method: "PUT",
        summary: summary,
        parameters: underscore.map(onePathParams.concat(modelParams), function (param) {
          return underscore.clone(param);
        }),
        nickname: getOperationNickName(onePath) + "_update"
      }]
    });
  }
  if (resource.controller.remove) {
    if (resource.type === "sub") {
      summary = "Delete " + lastPathName + " from " + summaryPostfix;
    } else if (resource.type === "ref" || resource.type === "backRef") {
      summary = "Delete " + lastPathName + " referenced by " + summaryPostfix;
    } else {
      summary = "Delete " + lastPathName;
    }
    operations.push({
      path: onePath,
      operations: [{
        method: "DELETE",
        summary: summary,
        parameters: underscore.map(onePathParams, function (param) {
          return underscore.clone(param);
        }),
        nickname: getOperationNickName(onePath) + "_remove"
      }]
    });
  }

  return operations;

  function getOperationNickName(operationPath) {
    return operationPath.replace(/[^a-z]+/ig, "_").replace(/^_*(.+?)_*$/, "$1");
  }
}

module.exports = function (app, resourceOptions) {

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);

  var model = options.model;
  if (!model) {
    var parent = options.parent;
    while (!model && parent) {
      model = parent.model;
      parent = parent.parent;
    }
  }
  var schema = options.schema;
  if (!schema) {
    schema = model.schema;
  }

  if (!schema.plural) {
    throw new Error("You should specify field 'plural' in model's schema");
  }

  var resource = new Resource(model, schema, [schema.plural], options.type, options.parent);
  resource.controller = new ResourceController(resource, options);
  if (options.controller) {
    underscore.extend(resource.controller, options.controller);
  }
  bindResource(app, resource, options);
  resource.operations = getResourceOperations(resource);

  return resource;

};






