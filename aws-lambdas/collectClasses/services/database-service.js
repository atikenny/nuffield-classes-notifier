const dynamodbDoc = require('dynamodb-doc');
const dynamoDB = new dynamodbDoc.DynamoDB();

const putItems = ({ TableName, Items }) => {
    return Promise.all(Items.map((Item) => {
        return new Promise((resolve, reject) => {
            dynamoDB.putItem({
                TableName,
                Item
            }, (error, result) => {
                if (error) {
                    reject(error);
                }

                resolve(result);
            });
        });
    }));
};

module.exports = {
    putItems
};
