var underscore = require("underscore");
var common = require("./common.js");
var mongoose = require('mongoose');

var defaultOptions = {};

function NotFoundError() {
  var tmp = Error.apply(this, arguments);
  tmp.name = this.name = 'NotFoundError';
  this.message = tmp.message;
  Object.defineProperty(this, 'stack', {
    get: function () {
      return tmp.stack
    }
  });
  return this;
}

/**
 * Get new resource controller
 * @param model Mongoose model for resource to work with
 * @param resourceOptions Resource options
 * @returns {Object} resource object
 */
module.exports = function (app, model, resourceOptions) {

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);

  var resources = findSubDocuments(model.schema, [options.name]);
  resources.unshift({
    path: [options.name]
  });

  resources.forEach(function (resource) {
    resource.ids = [];
    resource.path.forEach(function (resourceName) {
      resource.ids.push(resourceName.replace(/e?s$/, "") + "Id");
    });
    resource.schema = model.schema;
    resource.controller = getController(resource);
    bindResource(resource);
  });

  return resources;

  function findSubDocuments(schema, path) {
    var children = [], tree = schema.tree;
    for (var i in tree) {
      var value = tree[i];
      if (value instanceof Array && value.length === 1 && value[0].constructor.name === "Schema") {
        var elementPath = underscore.clone(path);
        elementPath.push(i);
        children.push({path: elementPath, schema: value[0]});
        Array.prototype.push.apply(children, findSubDocuments(value[0], elementPath));
      }
    }
    return children;
  }

  /**
   * Generate mongo field limit options based on request query "field" param.
   * Example: "?fields=_id,email" will genearate options { _id: 1, email: 1}, that limit result document to { _id:"...", email: "..."}
   * @param req Request object
   */
  function fieldLimitOptions(req, resource) {
    var fields = {};
    if (typeof req.query.fields === "string") {
      req.query.fields.split(/,\s*/).forEach(function (field) {
        if (typeof resource.schema[field] !== "undefined") {
          fields[field] = 1;
        }
      });
    }
    return fields;
  }

  /**
   *
   * @param err
   * @param modelName
   * @param doc
   * @param res
   * @param next
   * @returns {*}
   */
  function handleErrors(err, modelName, doc, res, next) {
    if (err) {
      return common.handleError(res, err, 400);
    }
    if (!doc) {
      return common.handleError(res, modelName + " not found", 404);
    }
    next();
  }

  /**
   * Get sub sub document list model based on values of IDs from req and model document.
   * Param path configured by ChildPath.
   * @param params Request path params
   * @param resource Resource
   * @param doc Model document
   * @returns {*} sub document list model
   */
  function getSubs(params, resource, doc) {
    var current = doc;
    var last = resource.path.length - 1;
    for (var i = 1; i < last; i++) {
      current = current[resource.path[i]].id(params[i]);
      if (!current) {
        throw new NotFoundError(resource.path[i]);
      }
    }
    return current[resource.path[last]];
  }

  /**
   * Get document from sub document model. See {@link getSubs}
   * @param params Request path params
   * @param resource Resource
   * @param doc Model document
   * @returns {*} sub document model
   */
  function getSub(params, resource, doc) {
    return getSubs(params, resource, doc).id(params[params.length - 1]);
  }

  /**
   * Require path parameter to exist
   * @param req Request
   * @param res Result
   * @param resource Resource
   * @param paramsCount Limits count of checked parameters
   * @param callback Function to call if parameter set
   */
  function checkParams(req, res, resource, paramsCount, callback) {
    var params = [];
    for (var i = 0; i < paramsCount; i++) {
      var param = req.params[resource.ids[i]];
      if (!param) {
        return common.handleNoParam(res, resource.ids[i]);
      }
      params.push(param);
    }
    callback(params);
  }

  /**
   * Save document
   * @param res Request
   * @param doc Mongoose document
   */
  function saveDoc(res, doc) {
    doc.save(function (err, doc) {
      if (err) {
        return common.handleError(res, err, 400);
      }
      return common.handleSuccess(res, doc);
    });
  }

  /**
   * Validate value object (calling options.validate and handles errors)
   * @param res Resule
   * @param body Value object
   * @returns {*} Validated value object
   */
  function validate(res, body) {
    var data = body;
    if (typeof options.validate === "function") {
      try {
        data = options.validate(data);
      } catch (ex) {
        return common.handleError(res, ex.message, 400);
      }
    }
    return data;
  }

  /**
   * Limit item (document or value object) props
   * @param item Item to limit
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} limit result
   */
  function limitItem(item, fields) {
    if (!fields) {
      return item;
    }
    var keys = underscore.keys(fields);
    if (!keys.length) {
      return item;
    }
    keys.unshift("_id");
    return underscore.pick(item, keys);
  }

  /**
   * Format document (calls options.format)
   * @param item Item to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} format result
   */
  function formatOne(item, fields) {
    return limitItem(typeof options.format === "function" ? options.format(item) : item, fields);
  }

  /**
   * Format list of documents (calls options.format and will exclude bad format results from list)
   * @param items Items list to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {Array} list format result
   */
  function format(items, fields) {
    var resultItems = [];
    items.forEach(function (item) {
      var filtered = formatOne(item, fields);
      if (filtered) {
        resultItems.push(filtered);
      }
    });
    return resultItems;
  }

  function getController(resource) {

    var controller = {};

    if (resource.ids.length > 1) {
      controller.index = function (req, res) {
        checkParams(req, res, resource, resource.path.length - 1, function (params) {
          model.findById(params[0], function (err, doc) {
            handleErrors(err, resource.ids[0], doc, res, function () {
              var result;
              try {
                result = getSubs(params, resource, doc);
              } catch (ex) {
                if (!(ex instanceof NotFoundError)) {
                  throw ex;
                }
                return common.handleError(res, ex.message + " not found", 404);
              }
              return common.handleSuccess(res, format(result, fieldLimitOptions(req, resource)));
            });
          });
        });
      };
    } else {
      controller.index = function (req, res) {
        model.find({}).lean().exec(function (err, result) {
          if (err) {
            return common.handleError(res, err, 400);
          }
          return common.handleSuccess(res, format(result, null));
        });
      };
    }


    if (resource.ids.length > 1) {
      controller.show = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findById(params[0], function (err, doc) {
            handleErrors(err, resource.ids[0], doc, res, function () {
              var result;
              try {
                result = getSub(params, resource, doc);
              } catch (ex) {
                if (!(ex instanceof NotFoundError)) {
                  throw ex;
                }
                return common.handleError(res, ex.message + " not found", 404);
              }
              return common.handleSuccess(res, formatOne(result, fieldLimitOptions(req, resource)));
            });
          });
        });
      };
    } else {
      controller.show = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findById(params[0], fieldLimitOptions(req, resource)).lean().exec(function (err, doc) {
            handleErrors(err, model.modelName, doc, res, function () {
              var formatted = formatOne(doc);
              if (!formatted) {
                return common.handleError(res, "You can't get this " + Model.modelName, 400);
              }
              return common.handleSuccess(res, formatted);
            });
          });
        });
      };
    }


    if (resource.ids.length > 1) {
      controller.create = function (req, res) {
        checkParams(req, res, resource, resource.path.length - 1, function (params) {
          model.findById(params[0], function (err, doc) {
            handleErrors(err, model.modelName, doc, res, function () {
              var schema = getSubs(params, resource, doc);
              var validated = validate(res, req.body);
              schema.push(validated);
              return saveDoc(res, doc);
            });
          });
        });
      };
    } else {
      controller.create = function (req, res) {
        return saveDoc(res, new model(validate(res, req.body)));
      };
    }


    if (resource.ids.length > 1) {
      controller.update = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findById(params[0], function (err, doc) {
            handleErrors(err, resource.ids[0], doc, res, function () {
              underscore.extend(getSub(params, resource, doc), validate(res, req.body));
              return saveDoc(res, doc);
            });
          });
        });
      };
    } else {
      controller.update = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findById(params[0], function (err, doc) {
            return saveDoc(res, underscore.extend(doc, validate(res, req.body)));
          });
        });
      };
    }


    if (resource.ids.length > 1) {
      controller.delete = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findById(params[0], function (err, doc) {
            handleErrors(err, resource.ids[0], doc, res, function () {
              getSub(params, resource, doc).remove();
              return saveDoc(res, doc);
            });
          });
        });
      };
    } else {
      controller.delete = function (req, res) {
        checkParams(req, res, resource, resource.path.length, function (params) {
          model.findOneAndRemove(params[0], function (err, doc) {
            return common.handleSuccess(res);
          });
        });
      };
    }

    return controller;
  }

  function bindResource(resource) {

    var prefix = options.context + '/',
      lastPathIndex = resource.path.length - 1,
      lastPathName = resource.path[lastPathIndex],
      lastId = resource.ids[lastPathIndex];

    for (var i = 0; i < lastPathIndex; i++) {
      prefix += resource.path[i] + '/:' + resource.ids[i] + '/';
    }

    app.route(prefix + lastPathName).get(resource.controller.index);
    app.route(prefix + lastPathName).post(resource.controller.create);
    app.route(prefix + lastPathName + '/:' + lastId).get(resource.controller.show);
    app.route(prefix + lastPathName + '/:' + lastId).put(resource.controller.update);
    app.route(prefix + lastPathName + '/:' + lastId).delete(resource.controller.delete);

    return resource;
  }

  /**
   * Register resource routes
   * @param app Express app to register into
   * @param contextPath App context path
   * @param resourceName Resource name
   * @param resourceNamePlural Resource name in plural form
   * @param parents Parent routes list { name:"...", plural:"..." }
   * @returns {Object} Used controller
   */
  var registerRoutes = function (app, contextPath, resourceName, resourceNamePlural, parents) {

  };

  registerRoutes.controller = Controller;

  return registerRoutes;

};