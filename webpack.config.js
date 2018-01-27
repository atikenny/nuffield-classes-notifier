const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    output: {
        path: path.resolve('build'),
        filename: 'index.js'
    },
    target: 'node',
    entry: './index.js',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: 'babel-loader'
            }
        ]
    },
    resolve: {
        extensions: ['.js']
    },
    externals: [nodeExternals()]
};
