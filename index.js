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

function Resource(schema, path, type, parent) {
  this.schema = schema;
  this.path = path;
  this.type = type ? type : "normal";
  this.children = [];
  if (parent) {
    this.path = parent.path.concat(this.path);
    this.parent = parent;
    this.model = parent.model;
    parent.children.push(this);
  }
}

function findResources(resource, modelResolver) {
  var resources = [resource], schemaTree = resource.schema.tree;

  for (var fieldName in schemaTree) {
    if (!schemaTree.hasOwnProperty(fieldName)) {
      continue;
    }
    var field = schemaTree[fieldName];
    if (helper.isSubSchema(field)) {

      Array.prototype.push.apply(resources, findResources(new Resource(field[0], [fieldName], "sub", resource)));

    } else if (helper.isRef(field)) {

      if (!modelResolver) {
        throw new Error("No model resolver specified");
      }
      
      var model = modelResolver(field.ref);
      var refResource = new Resource(model.schema, [fieldName.replace(/id$/i, "")], "ref", resource);
      refResource.model = model;
      Array.prototype.push.apply(resources, findResources(refResource));

      var backRefResource = new Resource(model.schema, [model.schema.plural, resource.model.schema.plural], "backRef");
      resources.push(backRefResource);

    } else if (helper.isSubRef(field)) {
      
      //TODO: add subRef

    }
  }
  return resources;
}

function ResourceController(resource) {


}

function bindResource(app, resource) {


}

function getResourceOperations(resource) {


}

var helper = {
  getFieldLimitOptions: function (req, resource) {
    var fields = {};
    if (typeof req.query.fields === "string") {
      req.query.fields.split(/,\s*/).forEach(function (field) {
        if (typeof resource.schema.paths[field] !== "undefined") {
          fields[field] = 1;
        }
      });
    }
    return fields;
  },
  /**
   * Limit document props
   * @param document Document to limit
   * @param fields Fields limit config {@see getFieldLimitOptions}
   * @returns {*} limit result
   */
  limitDocument: function (document, fields) {
    if (!fields) {
      return document;
    }
    var keys = underscore.keys(fields);
    if (!keys.length) {
      return document;
    }
    keys.unshift("_id");
    return underscore.pick(document, keys);
  },
  /**
   * Format document (calls options.format)
   * @param document Document to format
   * @param fields Fields limit config {@see fieldLimitOptions}
   * @returns {*} format result
   */
  formatOne: function (document, fields) {
    return helper.limitDocument(typeof options.format === "function" ? options.format(document) : document, fields);
  },
  /**
   * Require path parameter to exist
   * @param req Request
   * @param res Result
   * @param resource Resource
   * @param paramsCount Limits count of checked parameters
   */
  checkParams: function (req, res, resource, paramsCount) {
    return Q.promise(function () {
      var params = [];
      for (var i = 0; i < paramsCount; i++) {
        var param = req.params[resource.ids[i]];
        if (!param) {
          return common.handleNoParam(res, resource.ids[i]);
        }
        params.push(param);
      }
    });
  },
  handleErrors: function (res, modelName, err, doc) {
    return Q.promise(function () {
      if (err) {
        return common.handleError(res, err, 400);
      }
      if (!doc) {
        return common.handleError(res, modelName + " not found", 404);
      }
    });
  },
  isSubSchema: function (field) {
    return field instanceof Array && field.length === 1 && field[0].constructor.name === "Schema";
  },
  isRef: function (field) {
    return field.type && field.type.name === "ObjectId" && field.ref;
  },
  isSubRef: function (field) {
    return field instanceof Array && field.length === 1 && this.isRef(field[0]);
  }
};

module.exports = function (app, model, resourceOptions) {

  var options = underscore.extend(underscore.clone(defaultOptions), resourceOptions);
  var modelCache = {
    get: function (name) {
      if (typeof this[name] === "undefined") {
        if (!options.modelResolver) {
          throw new Error("No model resolver in options");
        }
        this[name] = options.modelResolver(name);
      }
      return this[name];
    }
  };

  if (!model.schema.plural) {
    throw new Error("You should specify field 'plural' in model's schema");
  }

  var rootResource = new Resource(model.schema, [model.schema.plural]);
  rootResource.model = model;

  var resources = findResources(rootResource, options.modelResolver);

  debugger;

  resources.forEach(function (resource) {
    resource.names = [];
    resource.ids = [];
    resource.path.forEach(function (resourceName) {
      var name = resourceName.replace(/s$/, "");
      resource.names.push(name);
      resource.ids.push(name + "Id");
    });
    resource.controller = new ResourceController(resource);
    if (options.controller) {
      underscore.extend(resource.controller, options.controller);
    }
    bindResource(app, resource);
    resource.operations = getResourceOperations(resource);
  });

  return resources;

};






