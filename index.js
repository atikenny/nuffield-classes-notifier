import handler from './src/handler.js';

exports.handler = (event, context, callback) => {
    handler(() => {
        callback(null, 'Finished collecting classes!');
    });
};
