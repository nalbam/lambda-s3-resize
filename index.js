/**
 * Lambda for creating jpg thumbnails
 *
 * Hardcoded configs and minimized variable declaration as recommended in 'Best Practices' sections
 * @link http://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
 *
 * ImageMagick wrapper for node.js not used :) Just raw command line... Only binary hardcore...)
 * Converting in one pass may save up to 15-20% of resources
 *
 * Steps:
 * 1) download image from input dir
 * 2) make thumbs via cli command
 * 3) upload all thumbs to s3 output dir
 * 4) send SNS notification (optional)
 * 5) remove file (optional)
 *
 * @author Alexey Snigirev <gigi@ua.fm>
 */

'use strict';

var path = require('path');
var aws = require('aws-sdk');
var s3 = new aws.S3();
var sns = new aws.SNS();

/**
 * Config for sizes
 */
var sizes = [
    {
        dimensions: '264x177',
        prefix: 'small'
    },
    {
        dimensions: '576x387',
        prefix: 'medium'
    },
    {
        dimensions: '1242x834',
        prefix: 'large'
    },
    {
        dimensions: '5000x5000',
        prefix: ''
    }
];

// JPEG quality
var QUALITY = 80;

// hex delimiter to split images from console
var HEX_JPEG_DELIMITER = "ffd8ffe000104";

// main function
exports.resizer = function (event, context) {
    // empty folder
    if (event.Records[0].s3.object.size <= 0) {
        console.log('Not object', JSON.stringify(event));
        context.succeed();
        return;
    }

    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;
    var absoluteKey = 'https://s3.amazonaws.com/' + bucket + '/' + key;
    var baseName = path.basename(key, path.extname(key));

    // change this dir for your needs
    var dstDir = 'output/' + path.basename(path.dirname(key)) + '/images/';

    // resize start
    resize(absoluteKey, handleBuffer);

    /**
     * This scope's functions section
     */

    /**
     * Prepares cli command and executes
     * We need something like this:
     * convert key \( +clone -quality 80 -interlace Plane -resize 264x177\> -write jpeg:- +delete \)
     *      \( +clone -quality 80 -interlace Plane -resize 576x387\> -write jpeg:- +delete \)
     *      \( +clone -quality 80 -interlace Plane -resize 1242x834\> -write jpeg:- +delete \)
     *      \( +clone -quality 80 -interlace Plane -resize 5000x5000\> -write jpeg:- +delete \)
     *      null:
     * @link http://www.imagemagick.org/script/command-line-options.php
     */
    function resize(key, callback) {
        var exec = require('child_process').exec;

        // basic command
        var cmd = 'convert ' + key + ' ';

        var dstFileName = '',
            baseParams;

        // some concatenate magic to build CLI command
        // binary output to stdout
        sizes.forEach(function (item) {
            baseParams = '-quality ' + QUALITY + ' -interlace Plane -resize ' + item.dimensions + '\\> ';
            cmd += '\\( +clone ' + baseParams + dstFileName + '-write jpeg:- +delete \\) ';
        });
        cmd += 'null:';

        exec(cmd, {
            encoding: 'binary',
            maxBuffer: 5000 * 1024
        }, callback);
    }

    /**
     * Splits stdout buffer to images
     *
     * @param err
     * @param stdout
     */
    function handleBuffer(err, stdout) {
        errorLog(err);
        var buffer = new Buffer(stdout, 'binary');
        var hex = buffer.toString('hex');
        var imagesHex = hex.split(HEX_JPEG_DELIMITER).slice(1);

        upload(imagesHex, notify);
    }

    /**
     * Uploads images to S3
     *
     * @param images
     * @param successCallback final callback when all data uploaded
     */
    function upload(images, successCallback) {
        var outputKey;
        var successCount = 0;
        var imagesCount = images.length;
        for (var i = 0; i < imagesCount; i++) {
            outputKey = dstDir + sizes[i].prefix + baseName + '.jpg';
            s3.putObject({
                    Bucket: bucket,
                    Key: outputKey,
                    Body: new Buffer(HEX_JPEG_DELIMITER + images[i], "hex"), // glue delimiter after split
                    ContentType: "image/jpeg",
                    ACL: "public-read"
                },
                function (err) {
                    errorLog(err);
                    successCount++;
                    if (successCount == imagesCount) {
                        // final callback
                        successCallback();
                    }
                }
            );
        }
    }

    /**
     * Sends SNS notify
     *
     * @param err
     */
    function notify(err) {
        errorLog(err);
        var message = {
            "type": "ImageThumbsReady",
            "state": "COMPLETED",
            "input": key,
            "output": dstDir
        };
        sns.publish({
            Message: JSON.stringify(message),
            Subject: 'ImageThumbsReady',
            TopicArn: getTopicArn(bucket)
        }, function (err, data) {
            errorLog(err);
            context.succeed('All operations successfully done!');// successful response
        });
    }

    /**
     * Returns ARN address constants
     * You get add some logic for dev and prod environment depending on bucket name
     *
     * @param bucket
     * @returns string
     */
    function getTopicArn(bucket) {
        var arn;
        switch (bucket) {
            case 'DEV':
                arn = 'arn:aws:sns:us-east-1:000000000000:devproj';
                break;
            case 'PROD':
                arn = 'arn:aws:sns:us-east-1:000000000000:prodproj';
                break;
        }
        return arn;
    }

    /**
     * Stops execution if error
     * @param err
     */
    function errorLog(err) {
        if (err) {
            context.fail(err);
        }
    }
};
