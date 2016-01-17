var webpack = require('webpack')
var path = require('path')
var fs = require('fs')
var nodeModules = fs.readdirSync('node_modules')

var banners = [
  'var regeneratorRuntime = require("regenerator-runtime-only")',
  'require("source-map-support").install();'
].join("\n")

module.exports = {
  entry: {
    // runner
    index: './runner/index.js',
    serverProcess: './runner/serverProcess',

    // cli
    flint: './cli/flint',
    flintBuild: './cli/flint-build',
    flintNew: './cli/flint-new',
    flintRun: './cli/flint-run',
    flintUpdate: './cli/flint-update',
  },
  target: 'node',
  devtool: 'sourcemap',
  output: {
    library: 'flint-runner',
    libraryTarget: 'umd',
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  },
  node: {
    Buffer: false,
    global: false,
    exec: false,
    process: false,
    setImmediate: false,
    __filename: true,
    __dirname: false
  },
  externals: [
    function(context, request, callback) {
      var pathStart = request.split('/')[0];
      if (nodeModules.indexOf(pathStart) >= 0 && request != 'webpack/hot/signal.js') {
        return callback(null, "commonjs " + request);
      };
      callback();
    }
  ],
  plugins: [
    new webpack.BannerPlugin(banners, { raw: true, entryOnly: false })
  ],
  // resolve babel-loader, json-loader, webpack from root to avoid install time
  resolveLoader: { root: path.join(__dirname, '..', '..', 'node_modules') },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        query: { stage: 1 }
      },
      { test: /\.json$/, loader: 'json-loader' }
    ],
  }
}
