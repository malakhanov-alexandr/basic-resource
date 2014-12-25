var undescore = require( "underscore" );
var common = require( "./common.js" );

/**
 * Get new resource controller
 * @param Model Mongoose model for resource to work with
 * @param {String[]} ChildPath Array of sub collection path. Registering with this param as array will result in sub resource REST path generation and usege of model sub collection in controller methods. Pass null or undefined if resource working with collection rether then with sub. Example: for model house { people: [{name: String, closes: [{ color: String }] }] } path for people will be ["people"] and for closes will be ["people", "closes"].
 */
module.exports = function ( Model, ChildPath ) {

    var Controller = {};
    var modelIdParamName = getModelIdParamName( Model.modelName );
    var paramNames;
    if ( ChildPath ) {
        paramNames = undescore.map( ChildPath, function ( element ) {
            return getModelIdParamName( element.replace( /s$/, '' ) );
        } );
    }

    /**
     * Get ID path param name based on model name
     * @param modelName Model name
     * @returns {string} Path param name
     */
    function getModelIdParamName( modelName ) {
        return modelName.substr( 0, 1 ).toLowerCase() + modelName.substr( 1 ) + "Id";
    }

    /**
     * Generate mongo field limit options based on request query "field" param.
     * Example: "?fields=_id,email" will genearate options { _id: 1, email: 1}, that limit result document to { _id:"...", email: "..."}
     * @param req Request object
     */
    function fieldLimitOptions( req ) {
        var fields = {};
        if ( typeof req.query.fields === "string" ) {
            req.query.fields.split( /,\s*/ ).forEach( function ( field ) {
                if ( typeof Model.schema.paths[field] !== "undefined" ) {
                    fields[field] = 1;
                }
            } );
        }
        return fields;
    }

    /**
     *
     * @param err
     * @param modelName
     * @param doc
     * @param res
     * @param next
     * @returns {*}
     */
    function handleErrors( err, modelName, doc, res, next ) {
        if ( err ) {
            return common.handleError( res, err, 400 );
        }
        if ( !doc ) {
            return common.handleError( res, modelName + " not found", 404 );
        }
        next();
    }

    /**
     * Get sub sub document list model based on values of IDs from req and model document.
     * Param path configured by ChildPath.
     * @param req Request
     * @param doc Model document
     * @returns {*} sub document list model
     */
    function getSubs( req, doc ) {
        var current = doc;
        var last = ChildPath.length - 1;
        for (var i = 0; i < last; i++) {
            var id = req.params[paramNames[i]];
            if ( !id ) {
                return common.handleNoParam( res, modelIdParamName );
            }
            current = doc[ChildPath[i]].id( id );
            if ( !current ) {
                return common.handleError( res, paramNames[i] + " not found", 404 );
            }
        }
        return current[ChildPath[ChildPath.length - 1]];
    }

    /**
     * Get document from sub document model. See {@link #getSubs}
     * @param req Request
     * @param doc Model document
     * @returns {*} sub document model
     */
    function getSub( req, doc ) {
        return getSubs( req, doc ).id( req.params[paramNames[ChildPath.length - 1]] );
    }

    function checkParam( req, res, name, callback ) {
        var param = req.params[name];
        if ( !param ) {
            return common.handleNoParam( res, name );
        }
        callback( param );
    }

    function saveDoc( req, res, doc ) {
        doc.save( function ( err, doc ) {
            if ( err ) {
                return common.handleError( res, err, 400 );
            }
            return common.handleSuccess( res, doc );
        } );
    }

    // ---- CREATE_NEW

    if ( ChildPath ) {
        Controller.createNew = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findById( id, function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        getSubs( req, doc ).push( req.body );
                        saveDoc( req, res, doc );
                    } );
                } );
            } );
        };
    } else {
        Controller.createNew = function ( req, res ) {
            saveDoc( req, res, new Model( req.body ) );
        };
    }

    // ---- FIND_BY_ID

    if ( ChildPath ) {
        Controller.findById = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findById( id, function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        var current = getSub( req, doc );
                        handleErrors( null, ChildPath[ChildPath.length - 1], current, res, function () {
                            return common.handleSuccess( res, current );
                        } );
                    } );
                } );
            } );
        }
    } else {
        Controller.findById = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findById( id, fieldLimitOptions( req ) ).lean().exec( function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        return common.handleSuccess( res, doc );
                    } );
                } );
            } );
        }
    }

    // ---- FIND_ALL

    if ( ChildPath ) {
        Controller.findAll = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findById( id, function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        return common.handleSuccess( res, getSubs( req, doc ) );
                    } );
                } );
            } );
        }
    } else {
        Controller.findAll = function ( req, res ) {
            Model.find( {}, fieldLimitOptions( req ) ).lean().exec( function ( err, result ) {
                if ( err ) {
                    return common.handleError( res, err, 400 );
                }
                return common.handleSuccess( res, result );
            } );
        }
    }

    // ---- UPDATE

    var updateDocumentByRequest;
    if ( ChildPath ) {
        updateDocumentByRequest = function ( req, doc ) {
            return undescore.extend( getSubs( req, doc ), req.body );
        }
    } else {
        updateDocumentByRequest = function ( req, doc ) {
            return undescore.extend( doc, req.body );
        }
    }

    Controller.update = function ( req, res ) {

        var id = req.params[modelIdParamName];
        if ( !id ) {
            return common.handleNoParam( res, modelIdParamName );
        }

        Model.findById( id, function ( err, doc ) {
            handleErrors( err, Model.modelName, doc, res, function () {
                updateDocumentByRequest( req, doc );
                saveDoc( req, res, doc );
            } )
        } );
    };
    
    // ---- REMOVE

    if ( ChildPath ) {
        Controller.remove = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findById( id, function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        getSub( req, doc ).remove();
                        return common.handleSuccess( res );
                    } )
                } );
            } );
        }
    } else {
        Controller.remove = function ( req, res ) {
            checkParam( req, res, modelIdParamName, function ( id ) {
                Model.findOneAndRemove( { _id: id }, function ( err, doc ) {
                    handleErrors( err, Model.modelName, doc, res, function () {
                        return common.handleSuccess( res );
                    } )
                } );
            } );
        }
    }

    /**
     * Register resource routes
     * @param app Express app to register into
     * @param contextPath App context path
     * @param resourceName Resource name
     * @param resourceNamePlural Resource name in plural form
     * @param parents Parent routes list { name:"...", plural:"..." }
     * @returns {Object} Used controller
     */
    var registerRoutes = function ( app, contextPath, resourceName, resourceNamePlural, parents ) {

        var prefix = contextPath + '/';

        if ( typeof parents !== "undefined" ) {
            parents.forEach( function ( parent ) {
                prefix += parent.plural + '/:' + parent.name + 'Id/';
            } );
        }

        app.route( prefix + resourceNamePlural ).post( Controller.createNew );
        app.route( prefix + resourceNamePlural ).get( Controller.findAll );
        app.route( prefix + resourceNamePlural + '/:' + resourceName + 'Id' ).get( Controller.findById );
        app.route( prefix + resourceNamePlural + '/:' + resourceName + 'Id' ).put( Controller.update );
        app.route( prefix + resourceNamePlural + '/:' + resourceName + 'Id' ).delete( Controller.remove );

        return Controller;
    };

    registerRoutes.controller = Controller;

    return registerRoutes;

};