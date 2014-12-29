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

[http://your-app-host/clients]() - `GET` to get all clients

[http://your-app-host/clients]() - `POST` for client creation

[http://your-app-host/clients/:clientId]() - `GET` to get one client

[http://your-app-host/clients/:clientId]() - `PUT` to save user

[http://your-app-host/clients/:clientId]() - `DELETE` - to delete user

You can pass additional query params:

Paramether `fields` will limit fields in result documents to specified. For example you can get `/clients?fields=_id,create` to only get `_id` and `create` fields of all clients

