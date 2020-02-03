'use strict';

const aws = require('aws-sdk')
    , s3 = new aws.S3({ apiVersion: '2006-03-01' })
    , gm = require('gm').subClass({ imageMagick: true })
    , debug = true;

if (!debug) {
    console.log = () => {
    };
    console.error = () => {
    };
}

const QUALITY = 95;

const Options = {
    ARTICLE: [ // 가로 기준
        { path: '1280', width: 1280, quality: QUALITY },
        { path: '640', width: 640, quality: QUALITY },
        { path: null } // width 또는 height 가 없으면 원본
    ],
    PROFILE: [ // 고정 크롭
        { path: null, width: 140, height: 140, quality: QUALITY }
    ],
    ORIGINAL: [
        { path: null } // 원본
    ],
    get: function (key) {
        const type = key.split('/')[1];
        if (type === 'article') {
            return Options.ARTICLE;
        } else if (type === 'profile') {
            return Options.PROFILE;
        } else {
            return Options.ORIGINAL;
        }
    }
};
const Watermark = {
    get: function (size) {
        if (size > 1000) {
            return 'stamp/watermark_1280.png';
        } else if (size > 900) {
            return 'stamp/watermark_960.png';
        } else if (size > 600) {
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
                resolve({
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
        console.log('putObject param : ', param);
        const dest = getDestKey(param.Key, param.Option.path);
        console.log('putObject dest : ', dest);
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

function resizeWidth(params) {
    console.log('resizeWidth params : ', params);
    return new Promise((resolve, reject) => {
        gm(params.Body)
            .autoOrient()
            .resize(params.Option.width, null, '>')
            .quality(params.Option.quality)
            .toBuffer(params.Format, function (err, buffer) {
                if (err) reject(err);
                else {
                    console.log('resizeWidth resolve : ', params);
                    resolve({
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
            .resize(params.Option.width, params.Option.height, '^')
            .gravity('Center')
            .extent(params.Option.width, params.Option.height)
            .quality(params.Option.quality)
            .toBuffer(params.Format, function (err, buffer) {
                if (err) reject(err);
                else {
                    console.log('resizeCrop resolve : ', params);
                    resolve({
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
        if (option.height) {
            return resizeCrop(p);
        } else if (option.width) {
            return resizeWidth(p);
        } else {
            return p;
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
            if (!param.Option.mark) {
                resolve(param);
            }
            const stamp = Watermark.get(param.Option.width);
            if (stamp === null) {
                resolve(param);
            }
            const pos = param.Option.mark;
            gm(param.Body)
                .gravity('NorthEast')
                .draw([`image Over ${pos} 0,0 "${stamp}"`])
                .toBuffer(param.Format, function (err, buffer) {
                    if (err) reject(err);
                    else {
                        resolve({
                            Bucket: param.Bucket,
                            Key: param.Key,
                            ContentType: param.ContentType,
                            Option: param.Option,
                            Body: buffer
                        });
                    }
                });
        });
    });
    console.log('watermark tasks : ', tasks);
    return Promise.all(tasks);
}

function getDestKey(key, suffix) {
    let dest = key.replace('origin/', 'resize/');
    if (suffix) {
        const arr = dest.split('/');
        arr.splice((arr.length - 1), 0, suffix);
        dest = arr.join('/');
    }
    return dest;
}

function getFormat(key) {
    const arr = key.split('.');
    return arr.pop().toLowerCase();
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
            console.log('result : ', result);
            callback(null, result);
        })
        .catch(error => {
            console.error('error : ', error);
            callback(error);
        });
};
