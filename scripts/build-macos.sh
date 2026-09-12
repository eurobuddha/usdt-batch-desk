#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_DIR="${1:-$PROJECT_DIR/dist/client}"
VERSION="$(node -p 'require(process.argv[1]).version' "$PROJECT_DIR/package.json")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Use a numeric major.minor.patch version in package.json.' >&2; exit 1; }
OUTPUT_DIR="${2:-$PROJECT_DIR/releases/$VERSION}"
DMG_NAME="Batch Desk-$VERSION-universal.dmg"
FINAL_APP="$OUTPUT_DIR/Batch Desk.app"
[[ -f "$ASSET_DIR/index.html" ]] || { echo 'Build the frontend first: npm run build' >&2; exit 1; }
[[ ! -e "$FINAL_APP" && ! -e "$OUTPUT_DIR/$DMG_NAME" ]] || { echo 'An app already exists in the output directory. Choose a new output directory.' >&2; exit 1; }
mkdir -p "$PROJECT_DIR/work" "$OUTPUT_DIR"
BUILD_DIR="$(mktemp -d "$PROJECT_DIR/work/native-build.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
APP="$BUILD_DIR/dmg/Batch Desk.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp -RX "$ASSET_DIR" "$APP/Contents/Resources/app"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>USDTBatchDesk</string>
<key>CFBundleIdentifier</key><string>app.usdtbatchdesk.shared</string>
<key>CFBundleName</key><string>Batch Desk</string>
<key>CFBundleDisplayName</key><string>Batch Desk</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
for ARCH in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -target "$ARCH-apple-macos13.0" -module-cache-path "$BUILD_DIR/cache" "$PROJECT_DIR/macos/BatchDesk.swift" -o "$BUILD_DIR/$ARCH"
done
xcrun lipo -create "$BUILD_DIR/arm64" "$BUILD_DIR/x86_64" -output "$APP/Contents/MacOS/USDTBatchDesk"
xcrun swift -module-cache-path "$BUILD_DIR/cache" "$PROJECT_DIR/macos/MakeIcon.swift" "$BUILD_DIR/AppIcon.iconset"
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
xattr -cr "$APP"
codesign --force --sign - "$APP"
ln -s /Applications "$BUILD_DIR/dmg/Applications"
xattr -cr "$BUILD_DIR/dmg"
codesign --verify --deep --strict "$BUILD_DIR/dmg/Batch Desk.app"
hdiutil create -volname "Batch Desk $VERSION" -srcfolder "$BUILD_DIR/dmg" -format UDZO "$BUILD_DIR/$DMG_NAME"
mv "$APP" "$FINAL_APP"
mv "$BUILD_DIR/$DMG_NAME" "$OUTPUT_DIR/$DMG_NAME"
(cd "$OUTPUT_DIR" && shasum -a 256 "$DMG_NAME" > SHA256SUMS.txt)
echo "Created $FINAL_APP and $OUTPUT_DIR/$DMG_NAME"
