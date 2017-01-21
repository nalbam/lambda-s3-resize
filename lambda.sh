#!/bin/sh

if [ ! -d target ]; then
    mkdir target
fi

zip -r ../../../target/lambda index.js node_modules
