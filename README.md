# basic-resource

> Register basic resources

Easy registration on basic REST resources on your Express/mongo node application.

## install

```sh
$ npm install -g bower
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
return require("basic-resource")(Client)(app, "/api", "client", "clients");
```

Basic urls to be register:

[http://your-app-host/clients]() - `GET` to get all clients

[http://your-app-host/clients]() - `POST` for client creation

[http://your-app-host/clients/:clientId]() - `GET` to get one client

[http://your-app-host/clients/:clientId]() - `PUT` to save user

[http://your-app-host/clients/:clientId]() - `DELETE` - to delete user

## Modify controller default methods

To replace methods use:

```js
var resource = require("basic-resource")(Client);
resource.controller.createNew = function(req, res) {
    res.statusCode = 406;
    return res.json({
      message: "you currently can't create new users"
    });
}
resource(app, "/api", "client", "clients");
```

## Configure generated controller

You can pass options to controller generator:

```js
var resource = require("basic-resource")(Client, {
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


