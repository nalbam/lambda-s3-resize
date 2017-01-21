#!/bin/sh

if [ ! -d target ]; then
    mkdir target
fi

pushd src/main/node

npm install

zip -r ../../../target/lambda index.js node_modules
