'use strict';

let aws = require('aws-sdk');
let async = require('async');
let gm = require('gm').subClass({ imageMagick: true });
let s3 = new aws.S3({ apiVersion: '2006-03-01' });

const supportTypes = ["jpg", "jpeg", "png", "gif"];
const Thumbnail = {
  PROFILE: [
    {alias: 's', type: 'crop', size: 140}
  ],
  ARTICLE: [
    {alias: 's', stamp: true, size: 640},
    {alias: 'm', stamp: true, size: 960},
    {alias: 'l', stamp: true, size: 1280}
  ],
  MESSAGE: [
    {alias: 'l', size: 1280}
  ],
  sizeFromKey: function(key) {
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

function destKeyFromSrcKey(key, suffix) {
    return key.replace('origin/', `resize/${suffix}/`)
}

function resizeAndUpload(response, size, srcKey, srcBucket, imageType, callback) {
    const pixelSize = size["size"];
    const resizeType = size["type"];

    function resizeWithAspectRatio(resizeCallback) {
        gm(response.Body)
            .autoOrient()
            .resize(pixelSize, pixelSize, '>')
            .noProfile()
            .quality(95)
            .toBuffer(imageType, function(err, buffer) {
                if (err) {
                    resizeCallback(err);
                } else {
                    resizeCallback(null, response.ContentType, buffer);
                }
            });
    }

    function resizeWithCrop(resizeCallback) {
        gm(response.Body)
            .autoOrient()
            .resize(pixelSize, pixelSize, '^')
            .gravity('Center')
            .extent(pixelSize, pixelSize)
            .noProfile()
            .quality(95)
            .toBuffer(imageType, function(err, buffer) {
                if (err) {
                    resizeCallback(err);
                } else {
                    resizeCallback(null, response.ContentType, buffer);
                }
            });
    }

    async.waterfall(
        [
            function resize(next) {
                if (resizeType == "crop") {
                    resizeWithCrop(next)
                } else {
                    resizeWithAspectRatio(next)
                }
            },
            function upload(contentType, data, next) {
                const destKey = destKeyFromSrcKey(srcKey, size["alias"]);
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
                callback(new Error(`resize to ${pixelSize} from ${srcKey} : ${err}`));
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

    // Lambda 타임아웃 에러는 로그에 자세한 정보가 안남아서 S3 파일 이름으로 나중에 에러처리하기위해 에러를 출력하는 코드
    const timeout = setTimeout(() => {
        callback(new Error(`[FAIL]:${bucket}/${key}:TIMEOUT`));
    }, context.getRemainingTimeInMillis() - 500);

    if (!key.startsWith('origin/')) {
        clearTimeout(timeout);
        callback(new Error(`[FAIL]:${bucket}/${key}:Unsupported image path`));
        return;
    }

    const params = {
        Bucket: bucket,
        Key: key
    };
    const keys = key.split('.');
    const imageType = keys.pop().toLowerCase();
    if (!supportTypes.some((type) => { return type == imageType })) {
        clearTimeout(timeout);
        callback(new Error(`[FAIL]:${bucket}/${key}:Unsupported image type`));
        return;
    }

    async.waterfall(
        [
            function download(next) {
                s3.getObject(params, next);
            },
            function transform(response, next) {
                let sizes = Thumbnail.sizeFromKey(key);
                if (sizes === null) {
                  next(new Error(`thumbnail type is undefined(allow articles or profiles), ${key}`));
                  return;
                }
                async.eachSeries(sizes, function (size, seriesCallback) {
                    resizeAndUpload(response, size, key, bucket, imageType, seriesCallback);
                }, next);
            }
        ], (err) => {
            if (err) {
                clearTimeout(timeout);
                callback(new Error(`[FAIL]:${bucket}/${key}:resize task ${err}`));
            } else {
                clearTimeout(timeout);
                callback(null, "complete resize");
            }
        }
    );
};
