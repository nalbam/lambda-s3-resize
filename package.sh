#!/bin/bash

if [ -d target ]; then
    rm -rf target
fi

mkdir target

pushd src/main/node

npm install -s

zip -q -r ../../../target/lambda *

popd
