# Web Payments Browser API

A browser polyfill that provides the Web Payments Browser API, which
supports:

 * Registration of payment applications
 * Requesting payment
 * Acknowledging payment

This polyfill works in conjunction with [web-payments.io][]. A
demo on web-payments.io is [here](https://web-payments.io).

# Documentation

This API enables a developer to write Web applications that can register
payment applications, request payment, and acknowledge payment. The
API is outlined below, separated by different actors in the system:

APIs called by payment application websites:
* *navigator.payment.registerApp(* **manifest** *)*

APIs called by payees (e.g. merchant websites):
* *navigator.payment.request(* **paymentRequest** *)*

APIs called by payment applications:
* *navigator.payment.acknowledge(* **acknowledgement** *)*
* *navigator.payment.getPendingRequest(* **options** *)*

## Registering a Payment App

The *navigator.payment.registerApp(* **manifest** *)* call can be used to
register a payment application with a user's browser.

The call takes the following arguments:

* **manifest** (**required** *object*) - A JSON-LD manifest describing the
  payment application, including its unique identifier, name, image, URL, and
  supported payment methods. The URL in the manifest will be loaded whenever a
  user selects the payment application to process a payment request. Its
  supported payment methods will be used to determine if it should be shown
  as an option for a particular payment request. If it is shown, its name and
  image will be displayed on a selection screen via the user's Payer Interface.

The call returns a *Promise* that resolves once the registration is complete.

Example:

```javascript
navigator.payment.registerApp({
  '@context': 'https://w3id.org/web-payments/v1',
  id: 'https://bitcoin-wallet.example.com/app/',
  type: 'PaymentApp',
  name: 'Example Bitcoin App',
  image: 'https://bitcoin-wallet.example.com/icons/app.png',
  url: 'https://bitcoin-wallet.example.com/app/',
  supportedPaymentMethod: [
    'https://w3id.org/payment-methods#Bitcoin'
  ]
}).then(function() {
  // ...
});
```

## Requesting Payment

The *navigator.payment.request(* **paymentRequest** *)* call can be
used to request payment.

The call takes the following arguments:

* **paymentRequest** (**required** *object*) - A JSON-LD payment request
  message containing the acceptable payment methods and other parameters.

The call returns a *Promise* that resolves to a JSON-LD payment acknowledgement
once the request has been processed by an appropriate payment application. An
acknowledgement does not necessarily indicate the payment has been completed;
the actual meaning of the acknowledgement is payment method specific. A payee
website may need to take further action to complete the payment.

```javascript
navigator.payment.request({
  '@context': 'https://w3id.org/web-payments/v1',
  type: 'PaymentRequest'
  description: 'Payment to ExampleMerch for Widget 1'
  acceptablePayment: [{
    paymentMethod: [
      'https://w3id.org/payment-methods#Visa',
      'https://w3id.org/payment-methods#Mastercard',
      'https://w3id.org/payment-methods#Discover'
    ],
    transfer: {
      amount: '4.35',
      currency: 'USD'
    }
  }, {
    paymentMethod: 'https://w3id.org/payment-methods#Bitcoin',
    transfer: {
      amount: '0.0177',
      currency: 'BTC'
    },
    destination: '3QJmV3qfvL9SuYo34YihAf3sRCW3qSinyC'
  },
  signature: {
    type: 'LinkedDataSignature2015',
    creator: 'https://payee.example.com/keys/23',
    created: '2015-09-23T20:21:34Z',
    nonce: '239847230947223423',
    signatureValue: 'OGQzNGVkMzVm4NTIyZTkZ...goYzI43Q3ODIyOWM32NjI='
  }
}).then(function(acknowledgement) {
  // ...
});
```

## Acknowledging a Payment

The *navigator.payment.acknowledge(* **acknowledgement** *)* call can be used
by a payment application to acknowledge that a payment request has been
processed. The exact meaning of the acknowledgement is payment method specific.

The call takes the following arguments:

* **acknowledgement** (**required** *object*) - A JSON-LD payment
  acknowledgement expressing the required payment method specific information
  to indicate a payment request has been processed.

```javascript
navigator.payment.acknowledge({
  '@context': 'https://w3id.org/web-payments/v1',
  type: 'PaymentAcknowledgement',
  description: 'Payment to ExampleMerch for widgets',
  payment: {
    paymentMethod: 'https://w3id.org/payment-methods#Visa',
    status: 'authorized',
    approvalCode: '10025AB',
    transfer: {
      amount: '4.35',
      currency: 'USD'
    }
  },
  signature: {
    type: 'LinkedDataSignature2015',
    creator: 'https://payment-service-provider.example.com/keys/12',
    created: '2015-09-23T20:23:15Z',
    nonce: '239807882930744352',
    signatureValue: 'm4NTIyZTOGQzNGVkMzVkZ...OWM32NjIgoYzI43Q3ODIy='
  }
});
```

## Getting a Pending Payment Request

The `getPendingRequest` method is only used by payment applications to
complete a pending `request` operation once the user has selected their
payment application of choice.

The call takes no arguments. It returns a *Promise* that resolves to the
JSON-LD payment request that was passed to `navigator.payment.request`.

The payment application can now help the user process the payment request.
Once payment application has completed the operation, it must call
`navigator.payment.acknowledge` and pass a payment acknowledgement. This will
cause the browser to navigate away from the payment application and return
the result to the payee website.

```javascript
navigator.payment.getPendingRequest().then(function(paymentRequest) {
  // ... handle payment request, generate acknowledgement

  // acknowledge payment request handled
  navigator.payment.acknowledge(acknowledgement);
});
```

Source
------

The source code for the JavaScript implementation is available at:

https://github.com/digitalbazaar/payment-polyfill


[web-payments.io]: https://github.com/digitalbazaar/web-payments.io
