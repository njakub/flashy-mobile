// getSentryExpoConfig wraps expo/metro-config's defaults and adds Sentry
// source-map/debug-id handling; all other Expo defaults are preserved.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Bundle the ONNX embedding model + vocab as binary/text assets — Metro only
// treats registered extensions as `require()`-able assets by default.
config.resolver.assetExts.push("onnx", "txt");

module.exports = config;
