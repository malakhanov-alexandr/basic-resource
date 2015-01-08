var underscore = require("underscore");
var common = require("./common.js");
var Q = require("q");
var prettyjson = require('prettyjson');

Object.defineProperty(Error.prototype, 'toJSON', {
  configurable: true,
  value: function () {
    var alt = {};
    var storeKey = function (key) {
      alt[key] = this[key]
    };
    Object.getOwnPropertyNames(this).forEach(storeKey, this)
    return alt
  }
});

module.exports = function (resource, options) {

  var helper = this;

  this.getQueryOptions = function (req) {
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
  };

  this.getQueryConstraints = function (req) {
    var constraints = {};
    if (req.query.search && req.query.search.value && req.query.columns) {
      var search = constraints.$or = [];
      req.query.columns.forEach(function (field) {
        var name = field.name;
        if (resource.schema.tree[name] && resource.schema.tree[name].type && resource.schema.tree[name].type.name === "String") {
          var fieldSearch = {};
          fieldSearch[name] = new RegExp(req.query.search.value, "i");
          search.push(fieldSearch);
        }
      });
      if (search.length === 0) {
        delete constraints.$or;
      }
    }
    return constraints;
  };

  this.filterQuery = function (req, query) {
    return typeof options.query !== "function" ? Q.promise(function (resolve) {
      resolve(query);
    }) : options.query(req, query);
  };

  this.getLimitOptions = function (req) {
    var fields = {};
    if (typeof req.query.fields === "string") {
      req.query.fields.split(/,\s*/).forEach(function (field) {
        if (typeof resource.schema.paths[field] !== "undefined") {
          fields[field] = 1;
        }
      });
    }
    return fields;
  };

  /**
   * Require path parameter to exist
   * @param req Request
   * @param res Result
   * @param paramsCount Limits count of checked parameters
   */
  this.checkParams = function (req, res, paramsCount) {
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
  };

  this.handleError = function (res, err) {
    if (!err.code || err.code === 500) {
      common.handleError(res, "Server internal error");
      console.error(prettyjson.render(JSON.parse(JSON.stringify(err))));
      //setTimeout(function () {
      //  throw err;
      //}, 0);
      return;
    }
    return common.handleError(res, err.message, err.code);
  };

  /**
   * Limit document props
   * @param document Document to limit
   * @param fields Fields limit config {@see getFieldLimitOptions}
   * @returns {*} limit result
   */
  this.limitDocument = function (document, fields) {
    if (!fields) {
      return document;
    }
    var keys = underscore.keys(fields);
    if (!keys.length) {
      return document;
    }
    keys.unshift("_id");
    return underscore.pick(document, keys);
  };

  /**
   * Format doc (calls options.format)
   * @param document Document to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} format result
   */
  this.formatOne = function (doc, fields) {
    return helper.limitDocument(typeof options.format === "function" ? options.format(doc) : doc, fields);
  };

  /**
   * Format list of documents (calls options.format and will exclude bad format results from list)
   * @param documents Items list to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {Array} list format result
   */
  this.format = function (documents, fields) { //TODO: pass controller method name
    var resultItems = [];
    documents.forEach(function (item) {
      var filtered = helper.formatOne(item, fields);
      if (filtered) {
        resultItems.push(filtered);
      }
    });
    return resultItems;
  };

  /**
   * Save document
   * @param res Request
   * @param doc Mongoose document
   */
  this.saveDoc = function (res, doc) {
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
  };

  /**
   * Parse value object (calling options.parse and handles errors)
   * @param body Value object
   * @returns {*} Parsed value object
   */
  this.parse = function (body, method) {
    return Q.Promise(function (resolve, reject) {
      var data = body;
      if (typeof options.parse === "function") {
        try {
          data = options.parse(data, method);
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
  };

  /**
   * Get sub sub document list model based on values of IDs from req and model document.
   * Param path configured by ChildPath.
   * @param params Request path params
   * @param doc Model document
   * @returns {*} sub document list model
   */
  this.getSubs = function (params, doc, startParamIndex) {
    var current = doc;
    var last = resource.path.length - 1;
    for (var i = startParamIndex ? startParamIndex : 1; i < last; i++) {
      current = current[resource.path[i]].id(params[i]);
      if (!current) {
        throw new errors.NotFoundError(resource.name[i]);
      }
    }
    return current[resource.path[last]];
  };

  /**
   * Get document from sub document model. See {@link getSubs}
   * @param params Request path params
   * @param doc Model document
   * @returns {*} sub document model
   */
  this.getSub = function (params, doc, startParamIndex) {
    var subs = getSubs(params, doc, startParamIndex);
    var result = subs.id(params[params.length - 1]);
    if (!result) {
      throw new errors.NotFoundError(resource.path[resource.name.length - 1]);
    }
    return result;
  };

};

