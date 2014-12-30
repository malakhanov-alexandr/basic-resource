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
 * @param app Express application instance
 * @param model Mongoose model for resource to work with
 * @param resourceOptions Resource options
 * @returns {Object} resource object
 */
module.exports = function (app, model, resourceOptions) {

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);

  var modelCache = {};

  var resources = findSubDocuments(model.schema, [model.schema.plural]);
  resources.unshift({
    path: [model.schema.plural]
  });

  resources.forEach(function (resource) {
    resource.ids = [];
    resource.path.forEach(function (resourceName) {
      resource.ids.push(resourceName.replace(/e?s$/, "") + "Id");
    });
    resource.schema = model.schema;
    resource.controller = getController(resource);
    if (options.controller) {
      underscore.extend(resource.controller, options.controller);
    }
    bindResource(resource);
  });

  return resources;

  function findSubDocuments(schema, path, refs) {
    var children = [], tree = schema.tree;
    for (var i in tree) {
      var value = tree[i];
      if (value instanceof Array && value.length === 1 && value[0].constructor.name === "Schema") {
        var elementPath = underscore.clone(path);
        elementPath.push(i);
        children.push({path: elementPath, schema: value[0], type: "sub"});
        Array.prototype.push.apply(children, findSubDocuments(value[0], elementPath));
      } else if (value.type && value.type.name === "ObjectId" && value.ref) {
        if (!options.modelResolver) {
          throw new Error("No model resolver in options");
        }
        if (!modelCache[value.ref]) {
          modelCache[value.ref] = options.modelResolver(value.ref);
        }
        var refModel = modelCache[value.ref];
        var elementPath = underscore.clone(path);
        elementPath.push(i.replace(/id$/i, ""));
        var elementRefs = underscore.clone(refs ? refs : []);
        elementRefs.push({field: i, model: refModel});
        children.push({path: elementPath, refs: elementRefs, schema: refModel.schema, type: "ref"});
        var backRefElementPath = underscore.clone(path);
        backRefElementPath.unshift(refModel.schema.plural);
        children.push({path: backRefElementPath, refs: elementRefs, schema: refModel.schema, type: "backRef"});
        Array.prototype.push.apply(children, findSubDocuments(refModel.schema, elementPath, elementRefs));
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
        if (typeof resource.schema.paths[field] !== "undefined") {
          fields[field] = 1;
        }
      });
    }
    return fields;
  }

  //TODO: add comments
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
    var result = getSubs(params, resource, doc).id(params[params.length - 1]);
    if (!result) {
      throw new NotFoundError(resource.path[resource.path.length - 1]);
    }
    return result;
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

    function index(req, res, doc) {

    }

    switch (resource.type) {
      case "sub":
      {
        //TODO: populate array of references
        controller.index = function (req, res) {
          checkParams(req, res, resource, resource.path.length - 1, function (params) {
            model.findById(params[0], function (err, doc) {
              handleErrors(err, resource.ids[0], doc, res, function () {
                var sub;
                try {
                  sub = getSubs(params, resource, doc);
                } catch (ex) {
                  if (!(ex instanceof NotFoundError)) {
                    throw ex;
                  }
                  return common.handleError(res, ex.message + " not found", 404);
                }
                var start = req.query.start,
                  length = req.query.length;
                if (start || length) {
                  sub = sub.slice(start ? start : 0, length ? (start + length) : sub.length);
                }
                return common.handleSuccess(res, format(sub, fieldLimitOptions(req, resource)), {
                  recordsFiltered: sub.length,
                  recordsTotal: sub.length
                });
              });
            });
          });
        };

        controller.one = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findById(params[0], function (err, doc) {
              handleErrors(err, resource.ids[0], doc, res, function () {
                var sub;
                try {
                  sub = getSub(params, resource, doc);
                } catch (ex) {
                  if (!(ex instanceof NotFoundError)) {
                    throw ex;
                  }
                  return common.handleError(res, ex.message + " not found", 404);
                }
                return common.handleSuccess(res, formatOne(sub, fieldLimitOptions(req, resource)));
              });
            });
          });
        };

        controller.create = function (req, res) {
          checkParams(req, res, resource, resource.path.length - 1, function (params) {
            model.findById(params[0], function (err, doc) {
              handleErrors(err, model.modelName, doc, res, function () {
                var sub;
                try {
                  sub = getSubs(params, resource, doc);
                } catch (ex) {
                  if (!(ex instanceof NotFoundError)) {
                    throw ex;
                  }
                  return common.handleError(res, ex.message + " not found", 404);
                }
                sub.push(validate(res, req.body));
                return saveDoc(res, doc);
              });
            });
          });
        };

        controller.update = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findById(params[0], function (err, doc) {
              handleErrors(err, resource.ids[0], doc, res, function () {
                var sub;
                try {
                  sub = getSub(params, resource, doc);
                } catch (ex) {
                  if (!(ex instanceof NotFoundError)) {
                    throw ex;
                  }
                  return common.handleError(res, ex.message + " not found", 404);
                }
                underscore.extend(sub, validate(res, req.body));
                return saveDoc(res, doc);
              });
            });
          });
        };

        controller.remove = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findById(params[0], function (err, doc) {
              handleErrors(err, resource.ids[0], doc, res, function () {
                var sub;
                try {
                  sub = getSub(params, resource, doc);
                } catch (ex) {
                  if (!(ex instanceof NotFoundError)) {
                    throw ex;
                  }
                  return common.handleError(res, ex.message + " not found", 404);
                }
                sub.remove();
                return saveDoc(res, doc);
              });
            });
          });
        };

        break;
      }
      case "ref":
      {

        controller.index = function (req, res) {
          checkParams(req, res, resource, 1, function (params) {
            var i = 0;
            var limit = {};
            limit[resource.refs[0].field] = 1;
            var query = model.findById(params[0], limit).exec(queryExec);
            
            function queryExec(err, doc) {
              handleErrors(err, model.modelName, doc, res, function () {
                var limit = {};
                var lastRef = i < resource.refs.length - 1;
                if(lastRef) {
                  limit[resource.refs[i + 1].field] = 1;
                }
                var query = resource.refs[i].model.findById(doc[resource.refs[i].field], limit);
                query.exec( lastRef ? function(err, doc) {
                  ++i;
                  queryExec(err, doc);
                } : function ( err, doc ) {
                  handleErrors( err, model.modelName, doc, res, function () {
                    var formatted = formatOne( doc, fieldLimitOptions( req, resource ) );
                    if ( !formatted ) {
                      return common.handleError( res, "You can't get this " + resource.path[resource.path.length - 1], 400 );
                    }
                    return common.handleSuccess( res, formatted );
                  } );
                } );
              });
            }
          });
        };

        break;
      }
      case "backRef": {

        controller.index = function (req, res) {
          checkParams(req, res, resource, resource.path.length - 1, function (params) {
            var queryOptions = { //TODO: make same DT logic for subs
              skip: req.query.start,
              limit: req.query.length
            };
            if ( req.query.order ) {
              queryOptions.sort = {};
              req.query.order.forEach( function ( order ) {
                queryOptions.sort[req.query.columns[order.column].data] = order.dir === "desc" ? -1 : 1;
              } );
            }
            var query = {};
            if ( req.query.search && req.query.search.value && req.query.columns ) {
              var search = query.$or = [];
              req.query.columns.forEach( function ( field ) {
                var name = field.data;
                if ( model.schema.tree[name] && model.schema.tree[name].type && model.schema.tree[name].type.name === "String" ) {
                  var fieldSearch = {};
                  fieldSearch[name] = new RegExp( req.query.search.value, "i" );
                  search.push( fieldSearch );
                }
              } );
            }
            query[resource.refs[0].field] = new mongoose.Types.ObjectId(params[0]);
            model.find( query, fieldLimitOptions( req, resource ), queryOptions ).lean().exec( function ( err, result ) {
              if ( err ) {
                return common.handleError( res, err, 400 );
              }
              if ( req.query.draw ) {
                result.draw = req.query.draw;
              }
              model.count( query, function ( err, count ) {
                return common.handleSuccess( res, format( result, null ), {
                  recordsFiltered: result.length,
                  recordsTotal: count
                } );
              } );
            } );
          });
        };
        
        
        break;
      }
      default:
      {

        controller.index = function (req, res) {
          var queryOptions = { //TODO: make same DT logic for subs
            skip: req.query.start,
            limit: req.query.length
          };
          if (req.query.order) {
            queryOptions.sort = {};
            req.query.order.forEach(function (order) {
              queryOptions.sort[req.query.columns[order.column].data] = order.dir === "desc" ? -1 : 1;
            });
          }
          var query = {};
          if (req.query.search && req.query.search.value && req.query.columns) {
            var search = query.$or = [];
            req.query.columns.forEach(function (field) {
              var name = field.data;
              if (model.schema.tree[name] && model.schema.tree[name].type && model.schema.tree[name].type.name === "String") {
                var fieldSearch = {};
                fieldSearch[name] = new RegExp(req.query.search.value, "i");
                search.push(fieldSearch);
              }
            });
          }
          model.find(query, fieldLimitOptions(req, resource), queryOptions).lean().exec(function (err, result) {
            if (err) {
              return common.handleError(res, err, 400);
            }
            if (req.query.draw) {
              result.draw = req.query.draw;
            }
            model.count(query, function (err, count) {
              return common.handleSuccess(res, format(result, null), {
                recordsFiltered: result.length,
                recordsTotal: count
              });
            });
          });
        };

        controller.one = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findById(params[0], fieldLimitOptions(req, resource)).lean().exec(function (err, doc) {
              handleErrors(err, model.modelName, doc, res, function () {
                var formatted = formatOne(doc);
                if (!formatted) {
                  return common.handleError(res, "You can't get this " + model.modelName, 400);
                }
                return common.handleSuccess(res, formatted);
              });
            });
          });
        };

        controller.create = function (req, res) {
          return saveDoc(res, new model(validate(res, req.body)));
        };

        controller.update = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findById(params[0], function (err, doc) {
              return saveDoc(res, underscore.extend(doc, validate(res, req.body)));
            });
          });
        };

        controller.remove = function (req, res) {
          checkParams(req, res, resource, resource.path.length, function (params) {
            model.findOneAndRemove(params[0], function (err, doc) {
              return common.handleSuccess(res);
            });
          });
        };

        break;
      }
    }

    return controller;
  }

  function bindResource(resource) {

    var prefix = options.context + '/',
      lastPathIndex = resource.path.length - 1,
      lastPathName = resource.path[lastPathIndex],
      lastId = resource.ids[lastPathIndex];

    for (var i = 0; i < lastPathIndex; i++) {
      prefix += resource.path[i] + '/';
      if(i === 0 || resource.type !== "ref") {
        prefix += ':' + resource.ids[i] + '/';
      }
    }

    if (resource.controller.index) {
      app.route(prefix + lastPathName).get(resource.controller.index);
    }
    if (resource.controller.create) {
      app.route(prefix + lastPathName).post(resource.controller.create);
    }
    if (resource.controller.one) {
      app.route(prefix + lastPathName + '/:' + lastId).get(resource.controller.one);
    }
    if (resource.controller.update) {
      app.route(prefix + lastPathName + '/:' + lastId).put(resource.controller.update);
    }
    if (resource.controller.remove) {
      app.route(prefix + lastPathName + '/:' + lastId).delete(resource.controller.remove);
    }

    return resource;
  }

};