'use strict';

const gm = require('gm').subClass({imageMagick: true});
const aws = require('aws-sdk');
const s3 = new aws.S3({apiVersion: '2006-03-01'});

const Options = {
    ARTICLE: [
        {path: 's', mark: true, quality: 90, size: 640},
        {path: 'm', mark: true, quality: 90, size: 960},
        {path: 'l', mark: true, quality: 90, size: 1280}
    ],
    PROFILE: [
        {path: 's', crop: true, quality: 90, size: 140}
    ],
    MESSAGE: [
        {path: 'l', quality: 90, size: 1280}
    ],
    get: function (key) {
        const type = key.split('/')[1];
        if (type === 'article') {
            return Options.ARTICLE;
        } else if (type === 'profile') {
            return Options.PROFILE;
        } else if (type === 'message') {
            return Options.MESSAGE;
        }
        return null;
    }
};
const Watermark = {
    get: function (size) {
        if (size == 1280) {
            return 'stamp/watermark_1280.png';
        } else if (size == 960) {
            return 'stamp/watermark_960.png';
        } else if (size == 640) {
            return 'stamp/watermark_640.png';
        }
        return null;
    }
};

function getObject(params) {
    console.log('getObject params : ', params);
    return new Promise((resolve, reject) => {
        s3.getObject(params, (err, data) => {
            console.log('getObject : data ', data);
            if (err) reject(err);
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

function putObject(params) {
    console.log('putObject params : ', params);
    let tasks = params.map(param => {
        const dest = getDestKey(param.Key, param.Option.path);
        const p = {
            Bucket: param.Bucket,
            Key: dest,
            ACL: 'public-read',
            Body: param.Body,
            ContentType: param.ContentType
        };
        return new Promise((resolve, reject) => {
            s3.putObject(p, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
    });
    console.log('putObject tasks : ', tasks);
    return Promise.all(tasks);
}

function resizeRatio(params) {
    console.log('resizeRatio params : ', params);
    return new Promise((resolve, reject) => {
        gm(params.Body)
            .autoOrient()
            .resize(params.Option.size, params.Option.size, '>')
            .quality(params.Option.quality)
            .toBuffer(params.Format, function (err, buffer) {
                if (err) reject(err);
                else {
                    return resolve({
                        Bucket: params.Bucket,
                        Key: params.Key,
                        ContentType: params.ContentType,
                        Option: params.Option,
                        Format: params.Format,
                        Body: buffer
                    });
                }
            });
    });
}

function resizeCrop(params) {
    console.log('resizeCrop params : ', params);
    return new Promise((resolve, reject) => {
        gm(params.Body)
            .autoOrient()
            .resize(params.Option.size, params.Option.size, '>')
            .gravity('Center')
            .extent(params.Option.size, params.Option.size)
            .quality(params.Option.quality)
            .toBuffer(params.Format, function (err, buffer) {
                if (err) reject(err);
                else {
                    return resolve({
                        Bucket: params.Bucket,
                        Key: params.Key,
                        ContentType: params.ContentType,
                        Option: params.Option,
                        Format: params.Format,
                        Body: buffer
                    });
                }
            });
    });
}

function resize(params) {
    console.log('resize params : ', params);
    const format = getFormat(params.Key);
    const options = Options.get(params.Key);
    let tasks = options.map(option => {
        console.log('resize option : ', option);
        const p = {
            Bucket: params.Bucket,
            Key: params.Key,
            ContentType: params.ContentType,
            Option: option,
            Format: format,
            Body: params.Body
        };
        if (option.crop) {
            return resizeCrop(p);
        } else {
            return resizeRatio(p);
        }
    });
    console.log('resize tasks : ', tasks);
    return Promise.all(tasks);
}

function watermark(params) {
    console.log('watermark params : ', params);
    let tasks = params.map(param => {
        return new Promise((resolve, reject) => {
            console.log('watermark param : ', param);
            if (param.Option.mark) {
                const stamp = Watermark.get(param.Option.size);
                gm(param.Body)
                    .draw([`image over 0,0 0,0 "${stamp}"`])
                    .toBuffer(param.Format, function (err, buffer) {
                        if (err) reject(err);
                        else {
                            return resolve({
                                Bucket: param.Bucket,
                                Key: param.Key,
                                ContentType: param.ContentType,
                                Option: param.Option,
                                Body: buffer
                            });
                        }
                    });
            } else {
                resolve(param);
            }
        });
    });
    console.log('watermark tasks : ', tasks);
    return Promise.all(tasks);
}

function getDestKey(key, suffix) {
    return key.replace('origin/', `resize/${suffix}/`)
}

function getFormat(key) {
    const keys = key.split('.');
    return keys.pop().toLowerCase();
}

exports.handler = (event, context, callback) => {
    console.log('## handler event : ', JSON.stringify(event, null, 2));

    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    const params = {
        Bucket: bucket,
        Key: key
    };

    Promise.resolve(params)
        .then(getObject)
        .then(resize)
        .then(watermark)
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
