var EventEmitter = require('events').EventEmitter
  , Memory = require('./Memory')
  , eventRegExp = require('./path').eventRegExp
  , mergeAll = require('./util').mergeAll
  ;

module.exports = Model;

function Model () {
  this._memory = new Memory();
  this._count = { id: 0 };
  // Set max listeners to unlimited
  this.setMaxListeners(0);

  // Used for model scopes
  this._root = this;
  this.mixinEmit('init', this);
}

var modelProto = Model.prototype
  , emitterProto = EventEmitter.prototype;

mergeAll(modelProto, emitterProto, {
  id: function () {
    return '$_' + this._clientId + '_' + (this._count.id++).toString(36);
  }

  /* Socket.io communication */

, connected: true
, canConnect: true

, _setSocket: function (socket) {
    this.socket = socket;
    this.mixinEmit('socket', this, socket);
    this.disconnect = function () { return socket.disconnect(); };
    this.connect = function (callback) {
      if (callback) socket.once('connect', callback);
      socket.socket.connect();
    };

    var self = this;
    this.canConnect = true;
    socket.on('fatalErr', function (msg) {
      self.canConnect = false;
      self.emit('canConnect', false);
      socket.disconnect();
    });

    this.connected = false;
    function onConnected () {
      self.emit('connected', self.connected);
      self.emit('connectionStatus', self.connected, self.canConnect);
    }

    socket.on('connect', function () {
      self.connected = true;
      onConnected();
    });

    socket.on('disconnect', function () {
      self.connected = false;
      // Slight delay after disconnect so that offline does not flash on reload
      setTimeout(onConnected, 400);
    });

    // Needed in case page is loaded from cache while offline
    socket.on('connect_failed', onConnected);
  }

  /* Scoped Models */

  // Create a model object scoped to a particular path.
  // Example:
  //   var user = model.at('users.1');
  //   user.set('username', 'brian');
  //   user.on('push', 'todos', function (todo) {
  //     // ...
  //   });
, at: function (segment, absolute) {
    var at = this._at
      , val = (at && !absolute)
            ? (segment === '')
              ? at
              : at + '.' + segment
            : segment.toString()
    return Object.create(this, { _at: { value: val } });
  }

  // Returns a model scope that is a number of levels above the current scoped
  // path. Number of levels defaults to 1, so this method called without
  // arguments returns the model scope's parent model scope.
, parent: function (levels) {
    if (! levels) levels = 1;
    var at = this._at;
    if (!at) return this;
    var segments = at.split('.');
    return this.at(segments.slice(0, segments.length - levels).join('.'), true);
  }

, path: function (rest) {
    var at = this._at;
    if (at) {
      if (rest) return at + '.' + rest;
      return at;
    }
    return rest || '';
  }

  // Returns the last property segment of the current model scope path
, leaf: function (path) {
    if (!path) path = this._at || '';
    var i = path.lastIndexOf('.');
    return path.substr(i+1);
  }

  /* Model events */

  // EventEmitter.prototype.on, EventEmitter.prototype.addListener, and
  // EventEmitter.prototype.once return `this`. The Model equivalents return
  // the listener instead, since it is made internally for method subscriptions
  // and may need to be passed to removeListener.

, _on: emitterProto.on
, on: function (type, pattern, callback) {
    var listener = eventListener(type, pattern, callback, this._at);
    this._on(type, listener);
    return listener;
  }

, _once: emitterProto.once
, once: function (type, pattern, callback) {
    var listener = eventListener(type, pattern, callback, this._at)
      , self;
    this._on( type, function g () {
      var matches = listener.apply(null, arguments);
      if (matches) this.removeListener(type, g);
    });
    return listener;
  }

  // Used to pass an additional argument to local events. This value is added
  // to the event arguments in txns/mixin.Model
  // Example:
  //   model.pass({ ignore: domId }).move('arr', 0, 2);
, pass: function (arg) {
    return Object.create(this, { _pass: { value: arg } });
  }
});

modelProto.addListener = modelProto.on;

/**
 * Returns a function that is assigned as an event listener on method events
 * such as 'set', 'insert', etc.
 *
 * Possible function signatures are:
 *
 * - eventListener(method, pattern, callback, at)
 * - eventListener(method, pattern, callback)
 * - eventListener(method, callback)
 *
 * @param {String} method
 * @param {String} pattern
 * @param {Function} callback
 * @param {String} at
 * @return {Function} function ([path, args...], out, isLocal, pass)
 */
function eventListener (method, pattern, callback, at) {
  if (at) {
    if (typeof pattern === 'string') {
      pattern = at + '.' + pattern;
    } else if (pattern.call) {
      callback = pattern;
      pattern = at;
    } else {
      throw new Error('Unsupported event pattern on scoped model');
    }

    // on(type, listener)
    // Test for function by looking for call, since pattern can be a RegExp,
    // which has typeof pattern === 'function' as well
  } else if ((typeof pattern === 'function') && pattern.call) {
    return pattern;
  }

  // on(method, pattern, callback)
  var regexp = eventRegExp(pattern);
  return function (args, out, isLocal, pass) {
    var path = args[0];
    if (! regexp.test(path)) return;

    args = args.slice(1);
    var captures = regexp.exec(path).slice(1)
      , callbackArgs = captures.concat(args).concat([out, isLocal, pass]);
    callback.apply(null, callbackArgs);
    return true;
  };
}
