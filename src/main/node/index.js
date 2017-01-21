'use strict';

let async = require('async');
let gm = require('gm').subClass({imageMagick: true});

let aws = require('aws-sdk');
let s3 = new aws.S3({apiVersion: '2006-03-01'});

const Extensions = ['jpg', 'jpeg', 'png', 'gif'];
const Thumbnail = {
    ARTICLE: [
        {alias: 's', mark: true, quality: 90, size: 640},
        {alias: 'm', mark: true, quality: 90, size: 960},
        {alias: 'l', mark: true, quality: 90, size: 1280}
    ],
    PROFILE: [
        {alias: 's', type: 'crop', quality: 90, size: 140}
    ],
    MESSAGE: [
        {alias: 'l', quality: 90, size: 1280}
    ],
    get: function (key) {
        const type = key.split('/')[1];
        if (type === 'article') {
            return Thumbnail.ARTICLE;
        } else if (type === 'profile') {
            return Thumbnail.PROFILE;
        } else if (type === 'message') {
            return Thumbnail.MESSAGE;
        }
        return null;
    }
};
const Watermark = {
    get: function (size) {
        if (size >= 1280) {
            return 'watermark_1280.png';
        } else if (size >= 960) {
            return 'watermark_960.png';
        } else if (size >= 640) {
            return 'watermark_640.png';
        }
        return null;
    }
};

function destKeyFromSrcKey(key, suffix) {
    return key.replace('origin/', `resize/${suffix}/`)
}

function resizeAndUpload(response, thumb, srcKey, srcBucket, imageType, callback) {
    const alias = thumb['alias'];
    const size = thumb['size'];
    const type = thumb['type'];
    const mark = thumb['mark'];
    const quality = thumb['quality'];

    function resizeWithAspectRatio(cb) {
        gm(response.Body)
            .autoOrient()
            .resize(size, size, '>')
            .noProfile()
            .quality(quality)
            .toBuffer(imageType, function (err, buffer) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, response.ContentType, buffer);
                }
            });
    }

    function resizeWithCrop(cb) {
        gm(response.Body)
            .autoOrient()
            .resize(size, size, '^')
            .gravity('Center')
            .extent(size, size)
            .noProfile()
            .quality(quality)
            .toBuffer(imageType, function (err, buffer) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, response.ContentType, buffer);
                }
            });
    }

    async.waterfall(
        [
            function resize(next) {
                if (type == 'crop') {
                    resizeWithCrop(next)
                } else {
                    resizeWithAspectRatio(next)
                }
            },
            function upload(contentType, data, next) {
                const destKey = destKeyFromSrcKey(srcKey, alias);
                s3.putObject(
                    {
                        Bucket: srcBucket,
                        Key: destKey,
                        ACL: 'public-read',
                        Body: data,
                        ContentType: contentType
                    },
                    next
                );
            }
        ], (err) => {
            if (err) {
                callback(new Error(`resize to ${size} from ${srcKey} : ${err}`));
            } else {
                callback(null);
            }
        }
    )
}

exports.handler = (event, context, callback) => {
    console.log('## Received event:', JSON.stringify(event, null, 2));

    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    const timeout = setTimeout(() => {
        callback(new Error(`[Fail]:${bucket}/${key}:Timeout`));
    }, context.getRemainingTimeInMillis() - 500);

    if (!key.startsWith('origin/')) {
        clearTimeout(timeout);
        callback(new Error(`[Fail]:${bucket}/${key}:Unsupported image path.`));
        return;
    }

    const params = {
        Bucket: bucket,
        Key: key
    };
    const keys = key.split('.');
    const type = keys.pop().toLowerCase();
    if (!Extensions.some((ext) => {
            return ext == type;
        })) {
        clearTimeout(timeout);
        callback(new Error(`[Fail]:${bucket}/${key}:Unsupported image type.`));
        return;
    }

    async.waterfall(
        [
            function download(next) {
                s3.getObject(params, next);
            },
            function transform(response, next) {
                let thumb = Thumbnail.get(key);
                if (thumb === null) {
                    next(new Error(`[Fail]:${bucket}/${key}:Unsupported thumbnail type.`));
                    return;
                }
                async.eachSeries(thumb, function (thumb, cb) {
                    resizeAndUpload(response, thumb, key, bucket, imageType, cb);
                }, next);
            }
        ], (err) => {
            if (err) {
                clearTimeout(timeout);
                callback(new Error(`[Fail]:${bucket}/${key}:${err}`));
            } else {
                clearTimeout(timeout);
                callback(null, `[Done]:${bucket}/${key}`);
            }
        }
    );
};
