var underscore = require("underscore");
var common = require("./common.js");
var mongoose = require("mongoose");
var errors = require("./errors.js");
var Q = require("q");

var defaultOptions = {};
var defaultGetParams = [
  {
    name: "fields",
    paramType: "query"
  }, {
    name: "start",
    paramType: "query"
  }, {
    name: "length",
    paramType: "query"
  }
];

function Resource(model, schema, path, options) {
  var resource = this;
  resource.model = model;
  resource.schema = schema;
  resource.type = options.type ? options.type : "normal";
  resource.children = [];
  resource.path = path;
  resource.names = [schema.name];
  resource.requiredParamsCount = 1;
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
      resource.getAll = function (params) {
        return Q.Promise(function (resolve, reject) {
          resource.getParentDoc(params).then(function (parentDoc) {
            resolve(parentDoc[resource.fieldName]);
          });
        });
      };
      resource.getOne = function (params) {
        return Q.Promise(function (resolve, reject) {
          resource.getAll(params.slice(0, -1)).then(function (result) {
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
      resource.getOne = function (params) {
        return Q.Promise(function (resolve, reject) {
          resource.parent.getOne(params).then(function (parentDoc) {
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
      resource.getAll = function (params) {
        return Q.Promise(function (resolve, reject) {
          resource.parent.getOne(params).then(function (parentDoc) {
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
      resource.getAll = function (params) {
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
      resource.getOne = function (params) {
        return Q.Promise(function (resolve, reject) {
          resource.model.findById(params[0], function (err, doc) {
            if (err) {
              reject(err);
            } else {
              resolve(doc);
            }
          });
        });
      };
      break;
    }
  }
}

function ResourceController(resource, options) {
  var controller = {};

  switch (resource.type) {
    case "sub":
    {

      controller.index = function (req, res) {
        checkParams(req, res, resource.path.length - 1).then(function (params) {
          return resource.getAll(params);
        }).then(function (result) {
          return Q.Promise(function (resolve, reject) {
            var filtered = underscore.where(result, getQueryConstraints(req));
            common.handleSuccess(res, format(filtered, getLimitOptions(req)), {
              recordsFiltered: filtered.length,
              recordsTotal: result.length
            });
            resolve(result);
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      controller.one = function (req, res) {
        checkParams(req, res, resource.path.length).then(function (params) {
          return resource.getOne(params);
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.name));
            }
            var formatted = formatOne(doc, getLimitOptions(req));
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
        checkParams(req, res, resource.path.length - 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams).then(function (modelDoc) {
              parse(req.body).then(function (data) {
                getSubs(subParams, modelDoc, parentsSkipped).push(data);
                return saveDoc(res, modelDoc);
              }).fail(function (err) {
                reject(err);
              });
            });
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };

      controller.update = function (req, res) {
        checkParams(req, res, resource.path.length).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams).then(function (modelDoc) {
              parse(req.body).then(function (data) {
                var sub = getSub(subParams, modelDoc, parentsSkipped);
                underscore.extend(sub, data);
                return saveDoc(res, modelDoc);
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
        checkParams(req, res, resource.path.length).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams).then(function (modelDoc) {
              parse(req.body).then(function (data) {
                getSub(subParams, modelDoc, parentsSkipped).remove();
                return saveDoc(res, modelDoc);
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

      break;
    }
    case "ref":
    {

      controller.index = function (req, res) {
        checkParams(req, res, resource.requiredParamsCount).then(resource.getOne).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.name));
            }
            var formatted = formatOne(doc, getLimitOptions(req));
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

      break;
    }

    case "subRef":
    {

      controller.index = function (req, res) {
        checkParams(req, res, resource.path.length - 1).then(function (params) {
          return resource.getAll(params);
        }).then(function (result) {
          return Q.Promise(function (resolve, reject) {
            var filtered = underscore.where(result, getQueryConstraints(req));
            common.handleSuccess(res, format(filtered, getLimitOptions(req)), {
              recordsFiltered: filtered.length,
              recordsTotal: result.length
            });
            resolve(result);
          });
        }).fail(function (err) {
          handleError(res, err);
        });
      };
      
      //TODO: add subRef edit controllers
      //controller.create = function (req, res) {
      //  if (!req.body.data) {
      //    var err = new Error("No data specified in request");
      //    err.code = 400;
      //    return handleError(res, err);
      //  }
      //  if (typeof req.body.data === "string") {
      //    req.body.data = [req.body.data];
      //  } else if (!(req.body.data instanceof Array)) {
      //    var err = new Error("Data expected to be array");
      //    err.code = 400;
      //    return handleError(res, err);
      //  }
      //  checkParams(req, res, resource.path.length - 1).then(function (params) {
      //    return Q.Promise(function (resolve, reject) {
      //      var modelResource = resource.closestParentModelResource();
      //      var parentsSkipped = modelResource.path.length - 1;
      //      var subParams = params.slice(parentsSkipped);
      //      modelResource.getOne(subParams).then(function (modelDoc) {
      //        var field = getSubs(subParams, modelDoc, parentsSkipped);
      //        resource.model.find({_id: {$in: req.body.data}}, {_id: 1}, function (err, result) {
      //          if (err) {
      //            reject(err);
      //          } else {
      //            Array.prototype.push.apply(field, underscore.map(result, function(doc) {
      //              return doc._id;
      //            }));
      //            debugger;
      //            saveDoc(res, modelDoc);
      //            resolve(result);
      //          }
      //        });
      //      });
      //    });
      //  }).fail(function (err) {
      //    handleError(res, err);
      //  });
      //};

      break;
    }
    case "backRef":
    {
      controller.index = function (req, res) {
        checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var backRefConstraints = {};
            backRefConstraints[resource.ids[0]] = params[0];
            var constraints = underscore.extend(getQueryConstraints(req), backRefConstraints);
            resource.model.find(constraints, getLimitOptions(req), getQueryOptions(req)).lean().exec(function (err, result) {
              if (err) {
                err.code = 400;
                return reject(err);
              }

              resource.model.count(backRefConstraints, function (err, totalCount) {
                resource.model.count(constraints, function (err, count) {
                  return common.handleSuccess(res, format(result, null), {
                    recordsFiltered: count,
                    recordsTotal: totalCount
                  });
                });
              });

            });
          });
        }).fail(function (err) {
          handleError(res, err);
        });

      };

      break;
    }
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
              return reject(new errors.NotFoundError(resource.name));
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
        parse(req.body).then(function (data) {
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
            resource.model.findById(params[0], function (err, doc) {
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
              reject(new errors.NotFoundError(resource.name));
            } else {
              resolve(doc);
            }
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            parse(req.body).then(function (data) {
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
            resource.model.findOneAndRemove({_id: params[0]}, function (err, doc) {
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
              reject(new errors.NotFoundError(resource.name));
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
    if (!err.code) {
      common.handleError(res, "Server internal error");
      setTimeout(function () {
        throw err;
      }, 0);
    }
    return common.handleError(res, err.message, err.code);
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
   * Format doc (calls options.format)
   * @param document Document to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} format result
   */
  function formatOne(doc, fields) {
    return limitDocument(typeof options.format === "function" ? options.format(doc) : doc, fields);
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
   * Parse value object (calling options.parse and handles errors)
   * @param body Value object
   * @returns {*} Parsed value object
   */
  function parse(body) {
    return Q.Promise(function (resolve, reject) {
      var data = body;
      if (typeof options.parse === "function") {
        try {
          data = options.parse(data);
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

  /**
   * Get sub sub document list model based on values of IDs from req and model document.
   * Param path configured by ChildPath.
   * @param params Request path params
   * @param doc Model document
   * @returns {*} sub document list model
   */
  function getSubs(params, doc, startParamIndex) {
    var current = doc;
    var last = resource.path.length - 1;
    for (var i = startParamIndex ? startParamIndex : 1; i < last; i++) {
      current = current[resource.path[i]].id(params[i]);
      if (!current) {
        throw new errors.NotFoundError(resource.name[i]);
      }
    }
    return current[resource.path[last]];
  }

  /**
   * Get document from sub document model. See {@link getSubs}
   * @param params Request path params
   * @param doc Model document
   * @returns {*} sub document model
   */
  function getSub(params, doc, startParamIndex) {
    var subs = getSubs(params, doc, startParamIndex);
    var result = subs.id(params[params.length - 1]);
    if (!result) {
      throw new errors.NotFoundError(resource.path[resource.name.length - 1]);
    }
    return result;
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
    pathParams = [],
    lastPathIndex = resource.path.length - 1,
    lastPathName = resource.path[lastPathIndex],
    summaryPostfix = resource.names[0] + " as ";

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
    var parameters = underscore.map(pathParams.concat(defaultGetParams), function (param) {
      return underscore.clone(param);
    });
    if (resource.type === "ref") {
      parameters = underscore.map(pathParams.concat([defaultGetParams[0]]), function (param) {
        return underscore.clone(param);
      });
    }
    operations.push({
      path: allPath,
      operations: [
        {
          method: "GET",
          summary: summary,
          parameters: parameters,
          nickname: getOperationNickName(allPath) + "_index"
        }
      ]
    });
  }
  if (resource.controller.create) {
    if (resource.type === "sub") {
      summary = "Create new " + lastPathName.replace(/s$/, "") + " in " + summaryPostfix;
    } else {
      summary = "Create new " + lastPathName.replace(/s$/, "");
    }
    var parameters;
    if (resource.type === "subRef") {
      parameters = underscore.map(pathParams, function (param) {
        return underscore.clone(param);
      }).concat({
        name: "data",
        required: true,
        paramType: "form"
      });
    } else {
      parameters = underscore.map(combinedParams, function (param) {
        return underscore.clone(param);
      });
    }
    operations.push({
      path: allPath,
      operations: [
        {
          method: "POST",
          summary: summary,
          parameters: parameters,
          nickname: getOperationNickName(allPath) + "_create"
        }
      ]
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
      operations: [
        {
          method: "GET",
          summary: summary,
          parameters: underscore.map(onePathParams.concat([
            {
              name: "fields",
              paramType: "query"
            }
          ]), function (param) {
            return underscore.clone(param);
          }),
          nickname: getOperationNickName(onePath) + "_one"
        }
      ]
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
      operations: [
        {
          method: "PUT",
          summary: summary,
          parameters: underscore.map(onePathParams.concat(modelParams), function (param) {
            return underscore.clone(param);
          }),
          nickname: getOperationNickName(onePath) + "_update"
        }
      ]
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
      operations: [
        {
          method: "DELETE",
          summary: summary,
          parameters: underscore.map(onePathParams, function (param) {
            return underscore.clone(param);
          }),
          nickname: getOperationNickName(onePath) + "_remove"
        }
      ]
    });
  }

  return operations;

  function getOperationNickName(operationPath) {
    return operationPath.replace(/[^a-z]+/ig, "_").replace(/^_*(.+?)_*$/, "$1");
  }
}

module.exports = function (app, resourceOptions) {

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);

  var schema = options.schema;
  if (!schema && options.model) {
    schema = options.model.schema;
  }

  if (!schema.plural) {
    throw new Error("You should specify field 'plural' in model's schema");
  }

  var pathStart = schema.plural;

  if (options.type === "ref" || options.type === "subRef") {
    pathStart = options.refName ? options.refName : schema.name;
  }

  var resource = new Resource(options.model, schema, [pathStart], options);

  if (options.type === "ref" || options.type === "subRef") {
    resource.fieldName = pathStart;
  }

  resource.controller = new ResourceController(resource, options);
  if (options.controller) {
    underscore.extend(resource.controller, options.controller);
  }
  bindResource(app, resource, options);
  resource.operations = getResourceOperations(resource);

  return resource;

};






