var underscore = require("underscore");
var common = require("./common.js");
var errors = require("./errors.js");
var Q = require("q");

module.exports = Controller;

function Controller(resource, options) {

  var controller = {};
  var h = resource.helper;

  switch (resource.type) {
    case "sub":
    {

      controller.index = function (req, res) {
        h.checkParams(req, res, resource.path.length - 1).then(function (params) {
          return resource.getAll(params);
        }).then(function (result) {
          return Q.Promise(function (resolve, reject) {
            var filtered = underscore.where(result, h.getQueryConstraints(req));
            common.handleSuccess(res, h.format(filtered, h.getLimitOptions(req)), {
              recordsFiltered: filtered.length,
              recordsTotal: result.length
            });
            resolve(result);
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.one = function (req, res) {
        h.checkParams(req, res, resource.path.length).then(function (params) {
          return resource.getOne(params, req);
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.name));
            }
            var formatted = h.formatOne(doc, h.getLimitOptions(req));
            if (!formatted) {
              return reject(new errors.Forbidden());
            }
            common.handleSuccess(res, formatted);
            resolve(doc);
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.create = function (req, res) {
        h.checkParams(req, res, resource.path.length - 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams, req).then(function (modelDoc) {
              h.parse(req.body, "create").then(function (data) {
                h.getSubs(subParams, modelDoc, parentsSkipped).push(data);
                return h.saveDoc(res, modelDoc);
              }).fail(function (err) {
                reject(err);
              });
            });
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.update = function (req, res) {
        h.checkParams(req, res, resource.path.length).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams, req).then(function (modelDoc) {
              h.parse(req.body, "update").then(function (data) {
                var sub = h.getSub(subParams, modelDoc, parentsSkipped);
                underscore.extend(sub, data);
                return h.saveDoc(res, modelDoc);
              }).fail(function (err) {
                reject(err);
              });
            }).fail(function (err) {
              reject(err);
            });
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.remove = function (req, res) {
        h.checkParams(req, res, resource.path.length).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var modelResource = resource.closestModelResource();
            var parentsSkipped = modelResource.path.length - 1;
            var subParams = params.slice(parentsSkipped);
            modelResource.getOne(subParams, req).then(function (modelDoc) {
              h.parse(req.body, "remove").then(function (data) {
                h.getSub(subParams, modelDoc, parentsSkipped).remove();
                return h.saveDoc(res, modelDoc);
              }).fail(function (err) {
                reject(err);
              });
            }).fail(function (err) {
              reject(err);
            });
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      break;
    }
    case "ref":
    {

      controller.index = function (req, res) {
        h.checkParams(req, res, resource.requiredParamsCount).then(function(params) {
          return resource.getOne(params, req);
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.name));
            }
            var formatted = h.formatOne(doc, h.getLimitOptions(req));
            if (!formatted) {
              return reject(new errors.Forbidden());
            }
            common.handleSuccess(res, formatted);
            resolve(doc);
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      break;
    }

    case "subRef":
    {

      controller.index = function (req, res) {
        h.checkParams(req, res, resource.path.length - 1).then(function (params) {
          return resource.getAll(params);
        }).then(function (result) {
          return Q.Promise(function (resolve, reject) {
            var filtered = underscore.where(result, h.getQueryConstraints(req));
            common.handleSuccess(res, h.format(filtered, h.getLimitOptions(req)), {
              recordsFiltered: filtered.length,
              recordsTotal: result.length
            });
            resolve(result);
          });
        }).fail(function (err) {
          h.handleError(res, err);
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
      //      modelResource.getOne(subParams, req).then(function (modelDoc) {
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
        h.checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            var backRefConstraints = {};
            backRefConstraints[resource.ids[0]] = params[0];
            var constraints = underscore.extend(h.getQueryConstraints(req), backRefConstraints);
            resource.model.find(constraints, h.getLimitOptions(req), h.getQueryOptions(req)).lean().exec(function (err, result) {
              if (err) {
                err.code = 400;
                return reject(err);
              }

              resource.model.count(backRefConstraints, function (err, totalCount) {
                resource.model.count(constraints, function (err, count) {
                  return common.handleSuccess(res, h.format(result, null), {
                    recordsFiltered: count,
                    recordsTotal: totalCount
                  });
                });
              });

            });
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });

      };

      break;
    }
    default:
    {

      controller.index = function (req, res) {
        var constraints = h.getQueryConstraints(req);
        h.filterQuery(req, constraints).then(function (query) {
          resource.model.find(query, h.getLimitOptions(req), h.getQueryOptions(req)).lean().exec(function (err, result) {
            if (err) {
              err.code = 500;
              return h.handleError(res, err);
            }
            if (req.query.draw) {
              result.draw = req.query.draw;
            }
            resource.model.count(function (err, totalCount) {
              resource.model.count(constraints, function (err, count) {
                return common.handleSuccess(res, h.format(result, null), {
                  recordsFiltered: count,
                  recordsTotal: totalCount
                });
              });
            });
          });
        }).fail(function () {
          h.handleError(res, new errors.Forbidden());
        });
      };

      controller.one = function (req, res) {
        h.checkParams(req, res, 1).then(function (params) {
          return Q.Promise(function (resolve, reject) {
            h.filterQuery(req, {_id: params[0]}).then(function (query) {
              resource.model.findOne(query, h.getLimitOptions(req)).lean().exec(function (err, doc) {
                if (err) {
                  err.code = 400;
                  reject(err);
                } else if (!doc) {
                  reject(new errors.Forbidden());
                } else {
                  resolve(doc);
                }
              });
            }).fail(function (err) {
              h.handleError(res, new errors.Forbidden());
            });
          });
        }).then(function (doc) {
          return Q.Promise(function (resolve, reject) {
            if (!doc) {
              return reject(new errors.NotFoundError(resource.name));
            }
            var formatted = h.formatOne(doc, null);
            if (!formatted) {
              return reject(new errors.Forbidden());
            }
            common.handleSuccess(res, formatted);
            resolve(doc);
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.create = function (req, res) {
        h.parse(req.body, "create").then(function (data) {
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
          return h.saveDoc(res, doc);
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.update = function (req, res) {
        h.checkParams(req, res, 1).then(function (params) {
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
            h.parse(req.body, "update").then(function (data) {
              h.saveDoc(res, underscore.extend(doc, data)).then(function (doc) {
                resolve(doc);
              }).fail(function (err) {
                reject(err);
              });
            }).fail(function (err) {
              reject(err);
            });
          });
        }).fail(function (err) {
          h.handleError(res, err);
        });
      };

      controller.remove = function (req, res) {
        h.checkParams(req, res, 1).then(function (params) {
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
          h.handleError(res, err);
        });
      };

      break;
    }

  }

  return controller;

}

