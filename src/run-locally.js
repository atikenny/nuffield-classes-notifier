const handler = require('./index.js');

handler(null, null, (result, message) => {
    console.log(message);
});
