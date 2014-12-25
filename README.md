# basic-resource

> Register basic resources

Easy registration on basic REST resources on your Express/mongo node application.

## install

```sh
$ npm install -g bower
```

In your resource source add:

```js
var Client = mongoose.model("Client", ClientSchema);
return require("basic-resource")(Client)(app, "/api", "client", "clients");
```

Resource will use `clients` collection in your mongodb.

Basic urls to be register:

[http://your-app-host/clients]() - `GET` to get all clients
[http://your-app-host/clients]() - `POST` for client creation
[http://your-app-host/clients/:clientId]() - `GET` to get one client
[http://your-app-host/clients/:clientId]() - `PUT` to save user
[http://your-app-host/clients/:clientId]() - `DELETE` - to delete user

