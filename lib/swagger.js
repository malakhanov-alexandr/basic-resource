var underscore = require("underscore");

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

module.exports.getResourceOperations = function (resource) {
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
};