'use strict';

let aws = require('aws-sdk');
let s3 = new aws.S3({ apiVersion: '2006-03-01' });
let async = require('async');
let gm = require('gm').subClass({ imageMagick: true });

const supportImageTypes = ["jpg", "jpeg", "png", "gif"];
const ThumbnailSizes = {
  PROFILE: [
    {size: 80, alias: 's', type: 'crop'},
    {size: 256, alias: 'm', type: 'crop'},
    {size: 640, alias: 'l', type: 'crop'}
  ],
  ARTICLE: [
    {size: 192, alias: 's'},
    {size: 1280, alias: 'l'}
  ],
  MESSAGE: [
    {size: 1280, alias: 'l'}
  ],
  BUSINESS_ARTICLE_THUMB: [
    {size: 192, alias: 's', type: 'crop'}
  ],
  sizeFromKey: function(key) {
    const type = key.split('/')[1];
    if (type === 'article') {
      return ThumbnailSizes.ARTICLE;
    } else if (type === 'profile') {
      return ThumbnailSizes.PROFILE;
    } else if (type === 'message') {
      return ThumbnailSizes.MESSAGE;
    } else if (type === 'business_article_thumb') {
      return ThumbnailSizes.BUSINESS_ARTICLE_THUMB;
    }
    return null;
  }
}

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
    if (!supportImageTypes.some((type) => { return type == imageType })) {
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
                let sizes = ThumbnailSizes.sizeFromKey(key);
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
