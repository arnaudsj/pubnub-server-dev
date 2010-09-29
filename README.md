# Pubnub server for Node.js

## In a nutshell

- Talk to PubNub API from Node.js 

## Synopsis

When working from a git clone:

    var sys = require("sys");
    var client = require("../lib/redis-client").createClient();
    client.info(function (err, info) {
        if (err) throw new Error(err);
        sys.puts("Redis Version is: " + info.redis_version);
        client.close();
    });

- Refer to the many tests in `test/test.js` for many usage examples.
- Refer to the `examples/` directory for focused examples.

## Installation

This version requires at least `Node.js v0.2.0`.

Tested with Node.js `v0.2.0`.

You have a number of choices:

- git clone this repo or download a tarball and simply copy `lib/pubnub-client.js` into your project
- use git submodule
- use the [npm]() package manager for Node.js

## Running the tests

A good way to learn about this client is to read the test code.

To run the tests, install and run redis on the localhost on port 6379 (defaults).
Then run `node test/test.js [-v|-q]` where `-v` is for "verbose" and `-q` is for "quiet".

    $ node test/test.js
    ..................................................................
    ...........................++++++++++++++++++++++++++++++++++++

    [INFO] All tests have passed.

## Documentation




