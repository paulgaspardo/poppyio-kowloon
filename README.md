# Poppy I/O

Poppy I/O is a JavaScript framework for sending data between web apps
client-side through the user's web browser. It works by having one page (the
client) launch another (the service) in a popup window, connecting the two
through a common cross-document messaging protocol.

Poppy I/O is a client-side library. It should work on all reasonably modern
browsers and doesn't have any extra runtime dependencies, aside from a `Promise`
polyfill if you wish to support IE 11.

## Installation

Install the `poppyio` package from `npm`:

```
$ npm install poppyio
```

## Getting Started

To try it out and see what the API looks like, check out [the Introduction](https://poppy.io/2022/05-introduction/).


Generated [TypeDoc Documentation](https://js.poppy.io/typedoc/0.1.0/) is available.

## Module Formats

The public API consists of the following modules:

|Name|Description|
|----|---|
|`poppyio.js`|Main module in `package.json`; exports everything from `modal-request.js`, `modal-service.js`, `common.js`, and `injected.js`|
|<nobr>`modal-request.js`</nobr>|`ModalRequest` class, used by client pages to make requests of services|
|<nobr>`modal-service.js`</nobr>|`ModalService` class, used by service pages to handle client requests|
|`common.js`|Objects and types common to clients and services (currently just )
|`injected.js`|`Injected` class providing default implementations of user-interface elements; to enable import `inject-en`|
|<nobr>`inject-en.js`</nobr>|Sets up `Injected` with English-language strings and configures `ModalRequest` to use it. Nothing is exported, only has side-effects.|

You can consume them in one of 4 ways:

### ES6 Modules

The modern and recommended way, at the root level of the package are the ES
Modules:

```javascript
import ModalRequest from "poppyio/modal-request.js";
import "poppyio/inject-en";
```

### CommonJS (ES5) Modules

If your project requires a legacy CommonJS bundler, the modules are available
in CommonJS form in the `/cjs/` path, for instance:

```javascript
const ModalRequest = require("poppyio/cjs/modal-request").default;
require("poppyio/cjs/inject-en");
```

(There's probably a better way of doing this...)

### AMD (ES5) Modules

AMD versions are in the `/amd/` path, for instance:

```javascript
requirejs.configure({
  paths: {
    poppyio: "./node_modules/poppyio/amd"
  }
})
require(["poppyio/modal-request", "poppyio/inject-en"], function (mr) {
  var ModalRequest = mr.default;
});
```

### Bundle Script

If you aren't using a module system at all, you can use the bundle script that sets
up a `poppyio` global.

```html
<script src="https://unpkg.com/poppyio@0.1.0/bundle/poppyio.min.js"></script>
<script src="https://unpkg.com/poppyio@0.1.0/bundle/poppyio.inject-en.js"></script>
<script>
  var ModalRequest = poppyio.ModalRequest;
</script>
```

Equivalent to the first 2 script tags would also be:

```html
<script src="https://unpkg.com/poppyio@0.1.0/bundle/poppyio.en.min.js"></script>
```

For convenience, the bundle scripts include a [small Promise polyfill](https://github.com/RubenVerborgh/promiscuous),
so you don't need to supply one yourself. It (or the global `Promise` if available)
is exported as `poppyio.Promise` if you want to use it yourself.
