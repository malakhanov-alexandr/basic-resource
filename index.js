var underscore = require("underscore");
var common = require("./common.js");

/**
 * Get new resource controller
 * @param Model Mongoose model for resource to work with
 * @param resourceOptions Resource options
 * @param {String[]} ChildPath Array of sub collection path. Registering with this param as array will result in sub resource REST path generation and usege of model sub collection in controller methods. Pass null or undefined if resource working with collection rether then with sub. Example: for model house { people: [{name: String, closes: [{ color: String }] }] } path for people will be ["people"] and for closes will be ["people", "closes"].
 * @returns {Object} resource object
 */
module.exports = function (Model, resourceOptions, ChildPath) {

  var defaultOptions = {};

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);

  var Controller = {};
  var currentSchema = Model.schema.tree;
  var modelIdParamName = getModelIdParamName(Model.modelName);
  var paramNames;
  if (ChildPath) {
    paramNames = underscore.map(ChildPath, function (element) {
      return getModelIdParamName(element.replace(/s$/, ''));
    });
    ChildPath.forEach(function (element) {
      currentSchema = currentSchema[element][0].tree;
    });
  }

  /**
   * Get ID path param name based on model name
   * @param modelName Model name
   * @returns {string} Path param name
   */
  function getModelIdParamName(modelName) {
    return modelName.substr(0, 1).toLowerCase() + modelName.substr(1) + "Id";
  }

  /**
   * Generate mongo field limit options based on request query "field" param.
   * Example: "?fields=_id,email" will genearate options { _id: 1, email: 1}, that limit result document to { _id:"...", email: "..."}
   * @param req Request object
   */
  function fieldLimitOptions(req) {
    var fields = {};
    if (typeof req.query.fields === "string") {
      req.query.fields.split(/,\s*/).forEach(function (field) {
        if (typeof currentSchema[field] !== "undefined") {
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
   * @param req Request
   * @param doc Model document
   * @returns {*} sub document list model
   */
  function getSubs(req, doc) {
    var current = doc;
    var last = ChildPath.length - 1;
    for (var i = 0; i < last; i++) {
      var id = req.params[paramNames[i]];
      if (!id) {
        return common.handleNoParam(res, modelIdParamName);
      }
      current = doc[ChildPath[i]].id(id);
      if (!current) {
        return common.handleError(res, paramNames[i] + " not found", 404);
      }
    }
    return current[ChildPath[ChildPath.length - 1]];
  }

  /**
   * Get document from sub document model. See {@link getSubs}
   * @param req Request
   * @param doc Model document
   * @returns {*} sub document model
   */
  function getSub(req, doc) {
    return getSubs(req, doc).id(req.params[paramNames[ChildPath.length - 1]]);
  }

  /**
   * Require path parameter to exist
   * @param req Request
   * @param res Result
   * @param name Param name
   * @param callback Function to call if parameter set
   */
  function checkParam(req, res, name, callback) {
    var param = req.params[name];
    if (!param) {
      return common.handleNoParam(res, name);
    }
    callback(param);
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

  // ---- CREATE_NEW

  if (ChildPath) {
    Controller.createNew = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findById(id, function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            getSubs(req, doc).push(validate(res, req.body));
            saveDoc(res, doc);
          });
        });
      });
    };
  } else {
    Controller.createNew = function (req, res) {
      saveDoc(res, new Model(validate(res, req.body)));
    };
  }

  // ---- FIND_BY_ID

  if (ChildPath) {
    Controller.findById = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findById(id, function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            var current = getSub(req, doc);
            handleErrors(null, ChildPath[ChildPath.length - 1], current, res, function () {
              var formatted = formatOne(current, fieldLimitOptions(req));
              if (!formatted) {
                return common.handleError(res, "You can't get this " + Model.modelName, 400);
              }
              return common.handleSuccess(res, formatted);
            });
          });
        });
      });
    }
  } else {
    Controller.findById = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findById(id, fieldLimitOptions(req)).lean().exec(function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            var formatted = formatOne(doc);
            if (!formatted) {
              return common.handleError(res, "You can't get this " + Model.modelName, 400);
            }
            return common.handleSuccess(res, formatted);
          });
        });
      });
    }
  }

  // ---- FIND_ALL

  if (ChildPath) {
    Controller.findAll = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findById(id, function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            return common.handleSuccess(res, format(getSubs(req, doc), fieldLimitOptions(req)));
          });
        });
      });
    }
  } else {
    Controller.findAll = function (req, res) {
      Model.find({}, fieldLimitOptions(req)).lean().exec(function (err, result) {
        if (err) {
          return common.handleError(res, err, 400);
        }
        return common.handleSuccess(res, format(result));
      });
    }
  }

  // ---- UPDATE

  var updateDocumentByRequest;
  if (ChildPath) {
    updateDocumentByRequest = function (req, doc) {
      return underscore.extend(getSubs(req, doc), validate(res, req.body));
    }
  } else {
    updateDocumentByRequest = function (req, doc) {
      return underscore.extend(doc, validate(res, req.body));
    }
  }

  Controller.update = function (req, res) {

    var id = req.params[modelIdParamName];
    if (!id) {
      return common.handleNoParam(res, modelIdParamName);
    }

    Model.findById(id, function (err, doc) {
      handleErrors(err, Model.modelName, doc, res, function () {
        updateDocumentByRequest(req, doc);
        saveDoc(res, doc);
      })
    });
  };

  // ---- REMOVE

  if (ChildPath) {
    Controller.remove = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findById(id, function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            getSub(req, doc).remove();
            return common.handleSuccess(res);
          })
        });
      });
    }
  } else {
    Controller.remove = function (req, res) {
      checkParam(req, res, modelIdParamName, function (id) {
        Model.findOneAndRemove({_id: id}, function (err, doc) {
          handleErrors(err, Model.modelName, doc, res, function () {
            return common.handleSuccess(res);
          })
        });
      });
    }
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

    var prefix = contextPath + '/';

    if (typeof parents !== "undefined") {
      parents.forEach(function (parent) {
        prefix += parent.plural + '/:' + parent.name + 'Id/';
      });
    }

    app.route(prefix + resourceNamePlural).post(Controller.createNew);
    app.route(prefix + resourceNamePlural).get(Controller.findAll);
    app.route(prefix + resourceNamePlural + '/:' + resourceName + 'Id').get(Controller.findById);
    app.route(prefix + resourceNamePlural + '/:' + resourceName + 'Id').put(Controller.update);
    app.route(prefix + resourceNamePlural + '/:' + resourceName + 'Id').delete(Controller.remove);

    return Controller;
  };

  registerRoutes.controller = Controller;

  return registerRoutes;

};