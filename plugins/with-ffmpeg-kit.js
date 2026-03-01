/**
 * Custom Expo config plugin for ffmpeg-kit-react-native.
 *
 * The original ffmpeg-kit-ios-* pods were removed when the project was archived.
 * This plugin wires up a community-hosted replacement pod (shaquillehinds-ffmpeg-kit-ios)
 * that bundles the same XCFramework binaries.
 *
 * For Android, it sets the FFmpeg package variant in build.gradle.
 */
const {
  withDangerousMod,
  withGradleProperties,
} = require("expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");
const fs = require("fs");
const path = require("path");

const FFMPEG_POD_LINES = [
  // Community-hosted iOS binaries (replaces the deleted arthenica releases)
  `  pod 'shaquillehinds-ffmpeg-kit-ios', :podspec => 'https://raw.githubusercontent.com/shaquillehinds/ffmpeg/master/shaquillehinds-ffmpeg-kit-ios.podspec'`,
  // The RN bridge, pointed at the local podspec with no subspec
  // (we patched the podspec to depend on shaquillehinds-ffmpeg-kit-ios directly)
  `  pod 'ffmpeg-kit-react-native', :podspec => File.join(File.dirname(\`node --print "require.resolve('ffmpeg-kit-react-native/package.json')"\`), "ffmpeg-kit-react-native.podspec")`,
].join("\n");

function withFFmpegKitPods(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const contents = await fs.promises.readFile(podfile, "utf8");
      const result = mergeContents({
        tag: "ffmpeg-kit-react-native",
        src: contents,
        newSrc: FFMPEG_POD_LINES,
        anchor: /use_native_modules/,
        offset: 0,
        comment: "#",
      });
      await fs.promises.writeFile(podfile, result.contents, "utf-8");
      return cfg;
    },
  ]);
}

function withFFmpegKitAndroid(config, packageName) {
  if (!packageName) return config;
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === "property" && item.key === "ffmpegKitPackage")
    );
    cfg.modResults.push({
      type: "property",
      key: "ffmpegKitPackage",
      value: packageName,
    });
    return cfg;
  });
}

module.exports = function withFFmpegKit(config, props = {}) {
  const androidPackage = props.android?.package || props.package || "min";
  config = withFFmpegKitPods(config);
  config = withFFmpegKitAndroid(config, androidPackage);
  return config;
};
