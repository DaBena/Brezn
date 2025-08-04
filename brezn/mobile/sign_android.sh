#!/bin/bash

echo "🔐 Brezn Android Signing Script"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "INFO")
            echo -e "${BLUE}ℹ️  $message${NC}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "WARNING")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}❌ $message${NC}"
            ;;
    esac
}

# Check if we're in the mobile directory
if [ ! -f "package.json" ]; then
    print_status "ERROR" "Please run this script from the mobile directory"
    exit 1
fi

print_status "INFO" "Starting Android Signing Process..."

# Step 1: Check prerequisites
print_status "INFO" "Checking prerequisites..."

# Check if Java is available
if ! command -v java &> /dev/null; then
    print_status "ERROR" "Java not found. Please install Java JDK."
    exit 1
fi

# Check if keytool is available
if ! command -v keytool &> /dev/null; then
    print_status "ERROR" "keytool not found. Please install Java JDK."
    exit 1
fi

# Check if jarsigner is available
if ! command -v jarsigner &> /dev/null; then
    print_status "ERROR" "jarsigner not found. Please install Java JDK."
    exit 1
fi

print_status "SUCCESS" "Prerequisites check passed"

# Step 2: Create keystore directory
print_status "INFO" "Creating keystore directory..."
mkdir -p android/app/keystore

# Step 3: Generate debug keystore
print_status "INFO" "Generating debug keystore..."
cd android/app

if [ ! -f "debug.keystore" ]; then
    keytool -genkey -v -keystore debug.keystore \
        -storepass android -alias androiddebugkey \
        -keypass android -keyalg RSA -keysize 2048 \
        -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
    
    if [ $? -eq 0 ]; then
        print_status "SUCCESS" "Debug keystore generated"
    else
        print_status "ERROR" "Failed to generate debug keystore"
        exit 1
    fi
else
    print_status "SUCCESS" "Debug keystore already exists"
fi

# Step 4: Generate release keystore
print_status "INFO" "Generating release keystore..."
if [ ! -f "keystore/brezn-release-key.keystore" ]; then
    print_status "INFO" "Creating release keystore..."
    keytool -genkey -v -keystore keystore/brezn-release-key.keystore \
        -alias brezn-key -keyalg RSA -keysize 2048 \
        -validity 10000 -dname "CN=Brezn,O=Brezn Team,C=DE"
    
    if [ $? -eq 0 ]; then
        print_status "SUCCESS" "Release keystore generated"
    else
        print_status "ERROR" "Failed to generate release keystore"
        exit 1
    fi
else
    print_status "SUCCESS" "Release keystore already exists"
fi

cd ../..

# Step 5: Create gradle.properties for signing
print_status "INFO" "Creating gradle.properties for signing..."
cat > android/gradle.properties << 'EOF'
# Project-wide Gradle settings.

# IDE (e.g. Android Studio) users:
# Gradle settings configured through the IDE *will override*
# any settings specified in this file.

# For more details on how to configure your build environment visit
# http://www.gradle.org/docs/current/userguide/build_environment.html

# Specifies the JVM arguments used for the daemon process.
# The setting is particularly useful for tweaking memory settings.
# Default value: -Xmx1024m -XX:MaxPermSize=256m
# org.gradle.jvmargs=-Xmx2048m -XX:MaxPermSize=512m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8

# When configured, Gradle will run in incubating parallel mode.
# This option should only be used with decoupled projects. More details, visit
# http://www.gradle.org/docs/current/userguide/multi_project_builds.html#sec:decoupled_projects
# org.gradle.parallel=true

# AndroidX package structure to make it clearer which packages are bundled with the
# Android operating system, and which are packaged with your app's APK
# https://developer.android.com/topic/libraries/support-library/androidx-rn
android.useAndroidX=true
# Automatically convert third-party libraries to use AndroidX
android.enableJetifier=true

# Version of flipper SDK to use with React Native
FLIPPER_VERSION=0.125.0

# Use this property to specify which architecture you want to build.
# You can also override it from the CLI using
# ./gradlew <task> -PreactNativeArchitectures=x86_64
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64

# Use this property to enable support to the new architecture.
# This will allow you to use TurboModules and the Fabric render in
# your application. You should enable this flag either if you want
# to write custom TurboModules/Fabric components OR use libraries that
# are providing them.
newArchEnabled=false

# Use this property to enable or disable the Hermes JS engine.
# If set to false, you will be using JSC instead.
hermesEnabled=true

# Android signing configuration
MYAPP_UPLOAD_STORE_FILE=app/keystore/brezn-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=brezn-key
MYAPP_UPLOAD_STORE_PASSWORD=brezn2024
MYAPP_UPLOAD_KEY_PASSWORD=brezn2024
EOF

print_status "SUCCESS" "Gradle properties configured for signing"

# Step 6: Build signed APK
print_status "INFO" "Building signed APK..."
cd android

# Clean previous builds
./gradlew clean

# Build release APK
./gradlew assembleRelease

if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Signed APK built successfully"
else
    print_status "ERROR" "Failed to build signed APK"
    exit 1
fi

cd ..

# Step 7: Verify APK signature
print_status "INFO" "Verifying APK signature..."
if [ -f "android/app/build/outputs/apk/release/app-release.apk" ]; then
    jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk
    
    if [ $? -eq 0 ]; then
        print_status "SUCCESS" "APK signature verified"
    else
        print_status "WARNING" "APK signature verification failed"
    fi
else
    print_status "ERROR" "APK file not found"
    exit 1
fi

# Step 8: Create APK info
print_status "INFO" "Creating APK information..."
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
APK_DATE=$(date -r "$APK_PATH" "+%Y-%m-%d %H:%M:%S")

cat > android/app/build/outputs/apk/release/APK_INFO.txt << EOF
Brezn Android APK Information
============================

File: app-release.apk
Size: $APK_SIZE
Build Date: $APK_DATE
Version: 0.1.0
Version Code: 1
Package: com.brezn.dev

Signing Information:
- Keystore: brezn-release-key.keystore
- Alias: brezn-key
- Algorithm: RSA
- Key Size: 2048 bits
- Validity: 10000 days

Build Configuration:
- Min SDK: 21
- Target SDK: 33
- Compile SDK: 33
- NDK Version: 25.1.8937393

Architectures:
- armeabi-v7a
- arm64-v8a
- x86
- x86_64

Features:
- React Native 0.72.6
- Hermes JavaScript Engine
- Rust Native Library Integration
- P2P Network Support
- Tor Integration
- QR Code Generation/Scanning

Security:
- Signed with release keystore
- ProGuard disabled (for debugging)
- Network security config enabled
- Background services enabled

Distribution:
- F-Droid ready
- Google Play Store compatible
- Direct APK installation supported
EOF

print_status "SUCCESS" "APK information created"

# Summary
echo ""
print_status "INFO" "Android Signing Summary:"
echo "============================="

print_status "INFO" "Generated Files:"
echo "=================="
echo "✅ Debug keystore: android/app/debug.keystore"
echo "✅ Release keystore: android/app/keystore/brezn-release-key.keystore"
echo "✅ Signed APK: android/app/build/outputs/apk/release/app-release.apk"
echo "✅ APK Info: android/app/build/outputs/apk/release/APK_INFO.txt"
echo "✅ Gradle Properties: android/gradle.properties"

echo ""
print_status "INFO" "Keystore Information:"
echo "======================="
echo "Debug Keystore:"
echo "- Password: android"
echo "- Alias: androiddebugkey"
echo "- Key Password: android"
echo ""
echo "Release Keystore:"
echo "- Password: brezn2024"
echo "- Alias: brezn-key"
echo "- Key Password: brezn2024"
echo "- Validity: 10000 days"

echo ""
print_status "INFO" "Next Steps:"
echo "==========="
echo "1. Test signed APK on device"
echo "2. Upload to F-Droid"
echo "3. Submit to Google Play Store"
echo "4. Distribute APK directly"
echo "5. Update version for next release"

echo ""
print_status "SUCCESS" "Android signing completed!"