var util = require('./util')
  , mergeAll = util.mergeAll
  , isServer = util.isServer
  , isClient = !isServer;

if (isClient) require('es5-shim');

var EventEmitter = require('events').EventEmitter
  , plugin = require('./plugin');

var racer = module.exports = new EventEmitter();

mergeAll(racer, plugin, {
  version: require('../package').version
, isServer: isServer
, isClient: isClient
, protected: {
    Model: require('./Model')
  }
, util: util
});

// Note that this plugin is passed by string to prevent Browserify from
// including it
if (isServer) {
  racer.use(__dirname + '/racer.server');
}

racer
  .use(require('./mutators'))
  .use(require('./refs'))
  .use(require('./pubSub'))
  .use(require('./queries'))
  .use(require('./txns'))
  .use(require('./reconnect'));

if (isServer) {
  racer.use(__dirname + '/adapters/pubsub-memory');
}

// The browser module must be included last, since it creates a model instance,
// before which all plugins should be included
if (isClient) {
  racer.use(require('./racer.browser'));
}
