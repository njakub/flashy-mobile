const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Bundle the ONNX embedding model + vocab as binary/text assets — Metro only
// treats registered extensions as `require()`-able assets by default.
config.resolver.assetExts.push("onnx", "txt");

module.exports = config;
