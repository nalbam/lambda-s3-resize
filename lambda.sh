#!/bin/sh

if [ ! -d target ]; then
    mkdir target
fi

pushd src/main/node

zip -r ../../../target/lambda index.js node_modules
