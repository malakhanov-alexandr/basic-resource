var underscore = require("underscore");
var Controller = require("./lib/controller.js");
var Resource = require("./lib/resource.js");
var bind = require("./lib/bind.js");
var swagger = require("./lib/swagger.js");

var defaultOptions = {};

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
  } else if(options.type === "sub") {
    resource.fieldName = schema.plural;
  }

  resource.controller = new Controller(resource, options);
  if (options.controller) {
    underscore.extend(resource.controller, options.controller);
  }
  bind(app, resource, options);
  resource.operations = swagger.getResourceOperations(resource);

  return resource;

};






