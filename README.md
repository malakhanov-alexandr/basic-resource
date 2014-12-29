# basic-resource

> Register basic resources

Easy registration on basic REST resources on your Express/mongo node application.

## install

Install by command line:

```sh
$ npm install basic-resource
```

Or add to your package.json:

```json
{
    "basic-resource": "^0.2.0"
}
```

In your resource source add:

```js
var mongoose = require('mongoose');
var ClientSchema = mongoose.Schema({
    name: { type: String, required: true },
    city: { type: String, required: true },
    phone: { type: String, required: true },
    created: { type: Date, default: Date.now }
} );
var Client = mongoose.model("Client", ClientSchema);
return require("basic-resource")(app, Client, {name: "clients", context: "/api"});
```

Basic urls to be register:

[http://your-app-host/clients]() - `GET` to get all clients (controller method "index")

[http://your-app-host/clients]() - `POST` for client creation (controller method "create")

[http://your-app-host/clients/:clientId]() - `GET` to get one client (controller method "one")

[http://your-app-host/clients/:clientId]() - `PUT` to update user (controller method "update")

[http://your-app-host/clients/:clientId]() - `DELETE` - to delete user (controller method "delete")

You can pass additional query params:

Paramether `fields` will limit fields in result documents to specified. For example you can get `/clients?fields=_id,create` to only get `_id` and `create` fields of all clients

## Modify controller default methods

To replace methods use:

```js
var controller = {}; // create controller to 
controller.create = function(req, res) {
    res.statusCode = 406;
    return res.json({
      message: "you currently can't create new users"
    });
}
return require("basic-resource")(app, Client, {name: "clients", context: "/api", controller: controller});
```

## Configure generated controller

You can pass options to controller generator:

```js
var resource = require("basic-resource")(app, Client, {
    name: "clients", 
    context: "/api",
    validate: function(data) {
        return data.match(/[0-9A-F]+/i);
    },
    format: function(data) {
        if(data.index > 10) {
            return {index: "more then 10"};
        }
        return null;
    }
});
```


