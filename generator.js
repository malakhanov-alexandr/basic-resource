var Q = require("q");
var fs = require('fs');
var mongoose = require('mongoose');

var names = (fs.readFileSync(__dirname + "/db/names.txt") + "").split(/\n/);
var surnames = (fs.readFileSync(__dirname + "/db/surnames.txt") + "").split(/\n/);
var companies = (fs.readFileSync(__dirname + "/db/companies.txt") + "").split(/\n/);
var streets = (fs.readFileSync(__dirname + "/db/streets.txt") + "").split(/\n/);
var cities = (fs.readFileSync(__dirname + "/db/cities.txt") + "").split(/\n/);
var states = (fs.readFileSync(__dirname + "/db/states.txt") + "").split(/\n/);
var hosts = (fs.readFileSync(__dirname + "/db/hosts.txt") + "").split(/\n/);


module.exports = generate;

function generate(resource, count, refModels) {
  return Q.Promise(function (resolve, reject) {
    var schema = resource.schema;
    if (!schema && resource.model) {
      schema = resource.model.schema;
    }
    if (!schema) {
      return reject(new Error("no schema specified"));
    }
    var toGenerateCount = count && count < 1000 ? count : rand(50, 100), i = 0;

    generateNext();

    function generateNext() {
      var data = {}, fields = Object.keys(resource.schema.tree), j = 0;

      generateNextDataField();

      function generateNextDataField() {
        var fieldName = fields[j++];

        function next() {
          if (j < fields.length) {
            generateNextDataField();
          } else {
            resource.saveOne(data).then(function () {
              ++i;
              if (i >= toGenerateCount) {
                resolve(toGenerateCount);
              } else {
                generateNext();
              }
            }).fail(function (err) {
              reject(err);
            });
          }
        }

        if (resource.schema.tree.hasOwnProperty(fieldName)) {
          var options = resource.schema.tree[fieldName];
          if (options.required || rand(0, 100) > 30) {
            if (options.type && options.type.name === "ObjectId" && options.ref) {
              if (!refModels || !refModels[options.ref]) {
                throw new Error(options.ref + " model not set in refModels argument");
              }
              var refModel = refModels[options.ref];
              return refModel.count(function (err, count) {
                if (err) {
                  return reject(err);
                }
                var rand = Math.floor(Math.random() * count);
                refModel.findOne({}, {_id: 1}).skip(rand).exec(function (err, doc) {
                  if (err) {
                    reject(err);
                  } else {
                    data[fieldName] = doc._id;
                    return next();
                  }
                });
              });
            } else if (typeof options.generator === "function") {
              data[fieldName] = options.generator(i, data);
              return next();
            }
          }
        }

        return next();

      }
    }

  });
}

function rand(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

function generateName() {
  return names[rand(0, names.length - 1)];
}

function generateSurname() {
  return surnames[rand(0, surnames.length - 1)];
}

function generateCompany() {
  return companies[rand(0, companies.length - 1)];
}

function generateAddress() {
  return rand(1, 100) + " " + streets[rand(0, streets.length - 1)] + " st.";
}

function generateCity() {
  return cities[rand(0, cities.length - 1)];
}

function generateState() {
  return states[rand(0, states.length - 1)];
}

function generateZip() {
  return rand(10000, 99999) + "-" + rand(1000, 9999);
}

function generatePhone() {
  return "+" + rand(100, 400) + "-" + rand(10, 99) + "-" + rand(100, 999) + "-" + rand(10, 99) + "-" + rand(10, 99);
}

function generateDate() {
  return new Date((new Date()).getTime() + rand(-8640000000, +8640000000));
}

function generateHost() {
  return hosts[rand(0, hosts.length - 1)];
}
  
  
function generateEmail() {
  return generateName() + "@" + generateHost();
}

function constantGenerator(constant) {
  return function constantGenerator() {
    return constant;
  };
}

function genericGenerator(objectName) {
  return function genericGenerator(index) {
    return objectName + " " + (index + 1);
  };
}

function oneOfGenerator(list) {
  return function oneOfGenerator() {
    return list[rand(0, list.length - 1)];
  };
}

function afterDateGenerator(dateFieldName) {
  var now = (new Date()).getTime();
  return function afterDateGenerator(index, data) {
    if (!data[dateFieldName]) {
      return undefined;
    }
    var minStartDelta = now - data[dateFieldName].getTime();
    return new Date(now + rand(minStartDelta, +8640000000));
  };
}

module.exports.generators = {
  Name: generateName,
  Surname: generateSurname,
  Company: generateCompany,
  Address: generateAddress,
  City: generateCity,
  State: generateState,
  Zip: generateZip,
  Phone: generatePhone,
  Date: generateDate,
  Host: generateHost,
  Email: generateEmail,
  _constant: constantGenerator,
  _generic: genericGenerator,
  _oneOf: oneOfGenerator,
  _afterDate: afterDateGenerator
};