const aws = require('aws-sdk');
const ses = new aws.SES({ region: 'eu-west-1' });

const TO_EMAIL = 'bojarska.martyna@gmail.com';
const CC_EMAIL = 'atikenny@gmail.com';
const FROM_EMAIL = CC_EMAIL;
const EMAIL_CHARSET = 'UTF-8';

exports.handler = (event, context, callback) => {
    if (event.Records) {
        const newClasses = getNewClasses(event.Records);

        if (!newClasses.length) {
            callback(null, 'No new classes');
            return;
        }
        
        newClasses.sort(sortByDateAndTime);
        
        sendClassesInEmail(newClasses)
            .then((result) => {
                callback(null, 'Successfully sent classes email!');
            })
            .catch((error) => {
                console.error(error);
                callback(null, 'Could not send classes email!');
            });
    }
};

function getNewClasses(records) {
    return records
        .filter(filterNewRecord)
        .map((record) => {
            console.log('record: ', JSON.stringify(record.dynamodb));
            const image = record.dynamodb.NewImage || record.dynamodb.OldImage;
    
            return {
                time: image.time.S,
                day: image.day.S,
                freePlaces: image.isFull.BOOL ? 0 : image.freePlaces.N,
                name: image.name.S,
                isFull: image.isFull.BOOL,
                status: image.status.S
            };
        });
}

function filterNewRecord(record) {
    return record.eventName === 'INSERT';
}

function sortByDateAndTime(a, b) {
    const aTimestamp = new Date(`${a.day} ${a.time}`).valueOf();
    const bTimestamp = new Date(`${b.day} ${b.time}`).valueOf();

    return aTimestamp - bTimestamp;
}

function sendClassesInEmail(classes) {
    const params = {
        Destination: {
            ToAddresses: [TO_EMAIL],
            CcAddresses: [CC_EMAIL]
        },
        Message: {
            Body: {
                Html: {
                    Charset: EMAIL_CHARSET,
                    Data: getEmailBody(classes)
                }
            },
            Subject: {
                Charset: EMAIL_CHARSET,
                Data: `New classes at ${(new Date()).toLocaleString()}`
            }
        },
        Source: FROM_EMAIL
    };
    
    return new Promise((resolve, reject) => {
        ses.sendEmail(params, (error, data) => {
            if (error) {
                reject(error);
            }
            
            resolve(data);
        });
    });
}

function getEmailBody(classes) {
    return classes.reduce((message, item) => {
        return message += `
<h2>${item.name}</h2>
<h3>${item.day} - ${item.time}</h3>
<b>Number of free places:</b> ${item.freePlaces}<br>
<b>Full:</b> ${item.isFull ? 'yes' : 'no'}<br>
<b>Status:</b> ${item.status}<br>
        `;
    }, '');
}
