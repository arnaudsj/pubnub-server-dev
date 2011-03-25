# Pubnub server for Node.js

## In a nutshell

- Pubnub FOSS server for debugging & development based on Node.js & Redis 

## Synopsis

When working from a git clone:

  make
  bin/redis-server
  bin/node app.js 127.0.0.1 8080 localhost
  open app-showcase/mouse-speak/index.htm

- Refer to the many tests in `test/test.js` for many usage examples.
- Refer to the `app-showcase/` directory for focused examples.

## Installation

This version requires at least `Node.js v0.4.0`.

Tested with Node.js `v0.4.0`.

You have a number of choices:

- git clone this repo 
- download a tarball

## Running the tests

To run the tests, install and run redis on the localhost on port 6379 (defaults).
Then run `node test/test.js [-v|-q]` where `-v` is for "verbose" and `-q` is for "quiet".

    $ node test/test.js
    ..................................................................
    ...........................++++++++++++++++++++++++++++++++++++

    [INFO] All tests have passed.

## Documentation

A good way to learn about this server is to check out the documentation already avail on pubnub.com


