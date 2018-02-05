const setup = require('./starter-kit/setup');
const main = require('./handler.js');

exports.handler = async (event, context, callback) => {
    // For keeping the browser launch
    context.callbackWaitsForEmptyEventLoop = false;
    const browser = await setup.getBrowser();

    try {
        const result = await main(browser);

        callback(null, result);
    } catch (err) {
        callback(err);
    }
};
