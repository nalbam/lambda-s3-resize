'use strict';
console.log('Loading function...');

const im = require('imagemagick')
    , aws = require('aws-sdk')
    , s3 = new aws.S3({ apiVersion: '2006-03-01', region: 'ap-northeast-2' }) // Setup S3 region
    , sizes = [300, 600, 900] // Add more image size to resize
    , originalImageKeyPrefix = 'images' // Original image folder
    , resizedImageKeyPrefix = 'copy' // Resized image folder
    , debug = true; // Turn off debug flag on production mode

if (!debug) {
    console.log = () => {};
    console.error = () => {};
}

function getObject(params) {
    console.log('getObject() params', params);
    return new Promise((resolve, reject) => {
        s3.getObject(params, (err, data) => {
            if (err)  reject(err);
            else {
                return resolve({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    ContentType: data.ContentType,
                    Body: data.Body
                });
            }
        });
    });
}

function resize(params) {
    console.log('resize() params', params);
    let tasks = sizes.map(size => {
        return new Promise((resolve, reject) => {
            const p = {
                srcData: params.Body,
                width: size
            };    
            im.resize(p, (err, stdout, stderr) => {
                if (err) reject(err);
                else {
                    const key = `${resizedImageKeyPrefix}/${params.Key.replace(`${originalImageKeyPrefix}/`, '')}.${p.width}`;
                    resolve({
                        Bucket: params.Bucket,
                        Key: key,
                        ContentType: params.ContentType,
                        ACL: 'public-read',
                        Body: ( Buffer.isBuffer(stdout) ) ? stdout : new Buffer(stdout, "binary")
                    });
                }
            });        
        });
    });

    console.log('resize() tasks', tasks);
    return Promise.all(tasks);
}

function putObject(params) {
    console.log('putObject() params', params);
    let tasks = params.map(param => {
        return new Promise((resolve, reject) => {
           s3.putObject(param, (err, data) => {
               if (err)  reject(err);
               else resolve(data);
           });
        });    
    });
    console.log('putObject() tasks', tasks)
    return Promise.all(tasks);
}

exports.handler = (event, context, callback) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    // Get the object from the event and show its content type
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const params = {Bucket: bucket, Key: key};
    console.log('params', params);

    Promise.resolve(params)
        .then(getObject)
        .then(resize)
        .then(putObject)
        .then(result => {
            console.log(result);
            callback(null, result);
        })
        .catch(err => {
            console.error(err);
            callback(err);
        });
};
