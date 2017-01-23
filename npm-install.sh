#!/bin/sh

if [ -d target ]; then
    rm -rf target
fi

pushd src/main/node

npm install -s
