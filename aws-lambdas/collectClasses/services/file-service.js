const aws = require('aws-sdk');
const S3 = new aws.S3();

const readFile = ({ Bucket, Key }) => {
    return new Promise((resolve, reject) => {
        S3.getObject({
            Bucket,
            Key
        }, (error, data) => {
            if (error) {
                reject(error);
            }

            resolve(data.Body.toString('ascii'));
        });
    });
};

const writeFile = ({ Bucket, Key, Body }) => {
    return new Promise((resolve, reject) => {
        S3.upload({
            Bucket,
            Key,
            Body
        }, (error, data) => {
            if (error) {
                reject(error);
            }

            resolve(data);
        });
    });
};

module.exports = {
    readFile,
    writeFile
};
