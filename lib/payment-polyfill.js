/**
 * Web Payments Browser API Polyfill.
 *
 * A polyfill for the Web Payments Browser API is two parts:
 *
 * 1. A JavaScript library to be served along side a Web application that uses
 *   the API.
 *
 * 2. A "Payment Agent" which is implemented as a Web application that is
 *   served from a community run, independent origin.
 */
(function() {

//////////////// DISCOVER LOCAL CONTEXT TO INSTALL POLYFILL ON ////////////////

var local;
if(typeof global !== 'undefined') {
  local = global;
} else if(typeof window !== 'undefined') {
  local = window;
} else {
  try {
    local = Function('return this')();
  } catch (e) {
    throw new Error(
      'payment-polyfill failed to install because the global object is ' +
      'unavailable in this environment.');
  }
}

/////////////////// IF API PRESENT, DO NOT INSTALL POLYFILL ///////////////////

if('navigator' in local && 'payment' in local.navigator) {
  return;
}

////////////////////// DEFINE AND INSTALL PUBLIC API //////////////////////////

if(!('navigator' in local)) {
  local.navigator = {};
}
navigator.payment = new PaymentAgent();
local.PaymentAgent = PaymentAgent;

////////////////////////// PUBLIC PAYMENT AGENT API //////////////////////////

/**
 * Creates a new PaymentAgent.
 */
function PaymentAgent() {
  if(!(this instanceof PaymentAgent)) {
    return new PaymentAgent();
  }
}

/**
 * Registers a payment application.
 *
 * @param manifest the payment application's manifest.
 * @param [options] the options to use.
 *          [agentUrl] the agent URL to use to service the request. The
 *            default is `https://web-payments.io/register`.
 *
 * @return a Promise once the payment application has been registered.
 */
PaymentAgent.prototype.registerApp = function(manifest, options) {
  if(!manifest) {
    throw new Error(
      'Could not register payment application; manifest not provided.');
  }
  var agentUrl = options.agentUrl || 'https://web-payments.io/register';
  agentUrl = _updateQueryStringParameter(agentUrl, 'op', 'registerApp');
  agentUrl = _updateQueryStringParameter(agentUrl, 'route', 'params');
  agentUrl = _updateQueryStringParameter(
    agentUrl, 'origin', window.location.origin);
  return Flow.start(agentUrl, 'registerApp', manifest);
};

/**
 * Requests a payment.
 *
 * @param paymentRequest the payment request.
 * @param [options] the options to use.
 *          [agentUrl] the Payment Agent URL to use to proxy the request.
 *            The default is `https://web-payments.io/mediator`.
 *
 * @return a Promise that resolves to the result of the query.
 */
PaymentAgent.prototype.request = function(paymentRequest, options) {
  if(!paymentRequest) {
    throw new Error('Could not request payment; no payment request provided.');
  }
  options = options || {};
  var agentUrl = options.agentUrl || 'https://web-payments.io/mediator';
  agentUrl = _updateQueryStringParameter(agentUrl, 'op', 'request');
  agentUrl = _updateQueryStringParameter(agentUrl, 'route', 'params');
  agentUrl = _updateQueryStringParameter(
    agentUrl, 'origin', window.location.origin);
  return Flow.start(agentUrl, 'request', {paymentRequest: paymentRequest});
};

/**
 * Acknowledges a payment request.
 *
 * @param acknowledgement the payment acknowledgement.
 * @param [options] the options to use.
 *          [agentUrl] the agent URL to use to send the acknowledgement. The
 *            default is `https://web-payments.io/mediator`.
 */
PaymentAgent.prototype.acknowledge = function(acknowledgement, options) {
  var agentUrl = options.agentUrl || 'https://web-payments.io/mediator';
  agentUrl = _updateQueryStringParameter(agentUrl, 'op', 'request');
  agentUrl = _updateQueryStringParameter(agentUrl, 'route', 'result');
  agentUrl = _updateQueryStringParameter(
    agentUrl, 'origin', window.location.origin);
  return Flow.end(agentUrl, 'request', acknowledgement);
};

/**
 * Gets a pending payment request. This is called by a payment application.
 *
 * @param options the options to use.
 *          [agentUrl] the agent URL to use to get the pending request. The
 *            default is `https://web-payments.io/mediator`.
 *
 * @return a Promise that resolves to the payment request.
 */
PaymentAgent.prototype.getPendingRequest = function(options) {
  options = options || {};
  var agentUrl = options.agentUrl || 'https://web-payments.io/mediator';
  agentUrl = _updateQueryStringParameter(agentUrl, 'route', 'params');
  agentUrl = _updateQueryStringParameter(
    agentUrl, 'origin', window.location.origin);
  return Flow.resume(agentUrl).then(function(message) {
    return message.data;
  });
};

////////////////////////////// PRIVATE FLOW API ///////////////////////////////

/**
 * Note: This flow was copied from the Identity Credentials polyfill flow that
 * may have stronger privacy guarantees than are necessary (or that even make
 * sense) here.
 *
 * Flow for `payment.request`:
 *  - return Promise
 *  ===OPEN FLOW WINDOW TO PAYMENT AGENT URL===
 *  - send `params` request to opener (postMessage)
 *  - receive `params` from opener (postMessage)
 *  - cache params
 *  ===NAVIGATE FLOW WINDOW TO PAYMENT APP===
 *  - payment.getPendingRequest
 *    ===NEW IFRAME TO PAYMENT AGENT URL===
 *    - send `params` to opener (postMessage)
 *    ===CLOSE IFRAME===
 *  - create `result`
 *  - payment.acknowledge
 *    ===NEW IFRAME TO PAYMENT AGENT URL===
 *    - send `result` request to opener (postMessage)
 *    - receive `result` from opener (postMessage)
 *    - cache `result`
 *    - send `navigate` message to opener (postMessage)
 *    ===CLOSE IFRAME===
 *  ===NAVIGATE FLOW WINDOW TO PAYMENT AGENT URL===
 *    - send `result` to opener (postMessage)
 *  ===CLOSE FLOW WINDOW===
 *  - receive `result` (postMessage)
 *  - resolve Promise
 *
 * Flow for `payment.registerApp`:
 *  - return Promise
 *  ===OPEN FLOW WINDOW TO PAYMENT AGENT URL===
 *  - send `params` request to opener (postMessage)
 *  - receive `params` from opener (postMessage)
 *  - do payment app registration
 *  - send `result` to opener (postMessage)
 *  ===CLOSE FLOW WINDOW===
 *  - receive `result` (postMessage)
 *  - resolve Promise
 */
var Flow = {};

/**
 * Starts a payment flow in a new window.
 *
 * @param url the Payment Agent URL to use.
 * @param op the name of the operation the flow is for.
 * @param params the parameters for the flow.
 *
 * @return a Promise that resolves to the result of the flow.
 */
Flow.start = function(url, op, params) {
  // start flow in new, visible browsing context
  var context = new BrowsingContext(url, {visible: true});
  // serve params
  var channel = new Channel(context);
  // for message based on API function name
  return channel.serve(op + '.params', params).then(function() {
    // receive result
    return channel.receive(op + '.result');
  }).catch(function(err) {
    // ensure context is closed on error
    context.close();
    throw err;
  }).then(function(message) {
    context.close();
    return message.data;
  });
};

/**
 * Resumes an existing flow. This call is used to contact the Payment Agent
 * to request the parameters for the current flow.
 *
 * @param url the Payment Agent URL to use.
 *
 * @return a Promise that resolves to the resulting channel message containing
 *   its type and the flow parameters.
 */
Flow.resume = function(url) {
  // communicate with invisible context
  var context = new BrowsingContext(url);
  var channel = new Channel(context);
  return channel.receive(['request.params'])
    .then(function(message) {
      return message;
    }).catch(function(err) {
      // ensure context is closed on error
      context.close();
      throw err;
    }).then(function(message) {
      context.close();
      return message;
    });
};

/**
 * Ends an existing flow. This call is used to contact the Payment Agent,
 * send the result of the flow, and then navigate to the Payment Agent.
 *
 * @param url the Payment Agent URL to use.
 * @param op the name of the operation the flow is for.
 * @param result the result of the flow.
 *
 * @return a Promise that resolves when navigation is occurring.
 */
Flow.end = function(url, op, result) {
  // communicate with invisible context
  var context = new BrowsingContext(url);
  var channel = new Channel(context);
  return channel.serve(op + '.result', result).then(function() {
    // receive confirmation of end of flow, request to navigate
    return channel.receive('navigate');
  }).catch(function(err) {
    // ensure context is closed on error
    context.close();
    throw err;
  }).then(function() {
    context.close();
    // do navigation
    window.location.replace(url);
  });
};

/////////////// PRIVATE API CALLED BY PAYMENT AGENT HELPER API ////////////////

navigator.payment._Router = Router;

/**
 * Creates a new Router for use by the Payment Agent. The Payment Agent
 * uses a Router to send or receive either the parameters or the result of a
 * remote API call.
 *
 * @param subject `params` to create a Router for the parameters, `result` to
 *          create a Router for the `result`.
 * @param origin the origin to route communicate to/from.
 */
function Router(subject, origin) {
  if(!(this instanceof Router)) {
    return new Router(subject);
  }
  if(!(subject === 'params' || subject === 'result')) {
    throw new Error('subject must be "params" or "result"');
  }
  this.subject = subject;
  this.channel = new Channel(
    new BrowsingContext(origin, {handle: window.opener || window.top}));
}

/**
 * Called by the Payment Agent to request the parameters or the result from
 * a remote API operation.
 *
 * This call will notify its `opener browsing context` that it is ready to
 * receive either the parameters or the result from the remote operation. It
 * then returns a Promise that will resolve when the information has been
 * received.
 *
 * @param op the name of the API operation.
 *
 * @return a Promise that resolves to the received remote operation information.
 */
Router.prototype.request = function(op) {
  var self = this;
  return self.channel.request(op + '.' + self.subject).then(function(message) {
    return {
      origin: self.channel.origin,
      type: message.type,
      data: message.data
    };
  });
};

/**
 * Called by the Payment Agent send the parameters or the result for a
 * remote API operation.
 *
 * This call will send the result of the remote operation to the
 * `opener browsing context`. The `opener browsing context` is expected to
 * then resolve the Promise returned from the pending operation to the result.
 *
 * @param op the name of the API operation.
 * @param data the parameters or result to send.
 */
Router.prototype.send = function(op, data) {
  this.channel.send(op + '.' + this.subject, data);
};

/**
 * Called by the Payment Agent to signal the end of communication with
 * the `opener browsing context`, at which point it should redirect to
 * the Payment Agent for processing of the result of the flow.
 */
Router.prototype.navigate = function() {
  this.channel.send('navigate', null);
};

//////////////////////// PRIVATE BROWSING CONTEXT API /////////////////////////

/**
 * Creates a browsing context that can be communicated with using a
 * cross-origin channel. The channel will only operate if the browsing
 * context's origin matches that of the given `url`.
 *
 * @param [url] the URL for the browsing context; any communication channels
 *          that use the browsing context will be bound to this URL's origin.
 * @param [options] the options to use:
 *          [handle] a handle to an existing browsing context.
 *          [visible] true to create a visible browsing context, false to
 *            create an invisible one (defaults to false).
 */
function BrowsingContext(url, options) {
  var self = this;
  if(!(self instanceof BrowsingContext)) {
    return new BrowsingContext(url, options);
  }

  options = options || {};

  if('handle' in options) {
    if(!options.handle) {
      throw new Error('Invalid browser context handle.');
    }
    self.handle = options.handle;
  } else if(options.visible) {
    // create new window
    var width = options.width || 800;
    var height = options.height || 600;
    self.handle = window.open(url, '_blank',
      'left=' + ((screen.width - width) / 2) +
      ',top=' + ((screen.height - height) / 2) +
      ',width=' + width +
      ',height=' + height +
      ',resizeable,scrollbars');
    self.close = function() {
      self.handle.close();
    };
  } else {
    // create invisible iframe
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    self.handle = iframe.contentWindow;
    self.close = function() {
      iframe.parentNode.removeChild(iframe);
    };
  }

  self.origin = parseOrigin(url);

  function parseOrigin(url) {
    // `URL` API not supported on IE, use DOM to parse URL
    var parser = document.createElement('a');
    parser.href = url;
    return parser.protocol + '//' + parser.host;
  }
}

///////////////////////////// PRIVATE CHANNEL API /////////////////////////////

/**
 * Creates a new cross-origin communication Channel that is bound to another
 * browsing context.
 *
 * @param context the BrowsingContext to bind the Channel to.
 */
function Channel(context) {
  if(!(this instanceof Channel)) {
    return new Channel(context);
  }
  this.end = context.handle;
  this.origin = context.origin;
}

/**
 * Receives a request from the other end of the Channel and sends a response.
 *
 * @param type the type of request to serve, eg: <op.params/result>.
 * @param response the response data to serve.
 *
 * @return a Promise that resolves once the response has been served.
 */
Channel.prototype.serve = function(type, response) {
  var self = this;
  return self.receive(type).then(function() {
    self.send(type, response);
  });
};

/**
 * Requests a response from the other end of the Channel.
 *
 * @param type the type of response to request, eg: <op.params/result>.
 *
 * @return a Promise that resolves to the response.
 */
Channel.prototype.request = function(type) {
  return this.send(type, null).receive(type);
};

/**
 * Sends a message to the other end.
 *
 * @param type the type of message, eg: <op.params/result>.
 * @param data the data for the message.
 */
Channel.prototype.send = function(type, data) {
  var message = {type: type, data: data};
  this.end.postMessage(message, this.origin);
  return this;
};

/**
 * Receives a message from the other end.
 *
 * @param type the expected type of message, eg: <op.params/result>.
 *
 * @return a Promise that resolves to the received message.
 */
Channel.prototype.receive = function(type) {
  var self = this;
  if(!Array.isArray(type)) {
    type = [type];
  }
  return new Promise(function(resolve, reject) {
    // TODO: add timeout
    window.addEventListener('message', listener);
    function listener(e) {
      // TODO: is this check sufficient to prevent bugs/abuse?
      if(e.source === self.end && e.origin === self.origin) {
        window.removeEventListener('message', listener);
        // validate message
        if(!(typeof e.data === 'object' &&
          type.indexOf(e.data.type) !== -1 && 'data' in e.data)) {
          reject(new Error('Payment protocol error.'));
        } else {
          resolve(e.data);
        }
      }
    }
  });
};

/////////////////////////// PRIVATE HELPER FUNCTIONS //////////////////////////

/**
 * Update a query parameter in a URL.
 *
 * From: http://stackoverflow.com/questions/5999118/add-or-update-query-string-parameter#answer-6021027
 *
 * @param uri the base URI to use.
 * @param key the query parameter to add or modify.
 * @param value the value of the query parameter.
 *
 * @return the modified URI.
 */
function _updateQueryStringParameter(uri, key, value) {
  key = encodeURIComponent(key);
  value = encodeURIComponent(value);
  var re = new RegExp('([?&])' + key + '=.*?(&|$)', 'i');
  var separator = uri.indexOf('?') !== -1 ? '&' : '?';
  if(uri.match(re)) {
    return uri.replace(re, '$1' + key + '=' + value + '$2');
  }
  return uri + separator + key + '=' + value;
}

})();
