#!/bin/bash

if [ -d target ]; then
    rm -rf target
fi

pushd src/main/node

if [ -d node_modules ]; then
    rm -rf node_modules
fi

npm install -s
