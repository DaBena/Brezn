#!/bin/bash

# Brezn F-Droid Build Script
# This script builds the Rust libraries and Android APK for F-Droid

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RUST_TARGETS=(
    "aarch64-linux-android"
    "armv7-linux-androideabi"
    "x86_64-linux-android"
    "i686-linux-android"
)

ANDROID_ABIS=(
    "arm64-v8a"
    "armeabi-v7a"
    "x86_64"
    "x86"
)

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MOBILE_DIR="$PROJECT_ROOT/brezn/mobile"
ANDROID_DIR="$MOBILE_DIR/android"

echo -e "${BLUE}🚀 Brezn F-Droid Build Script${NC}"
echo "=================================="
echo "Project Root: $PROJECT_ROOT"
echo "Mobile Dir: $MOBILE_DIR"
echo "Android Dir: $ANDROID_DIR"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}📋 Checking prerequisites...${NC}"
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        echo -e "${RED}❌ Rust (cargo) not found. Please install Rust first.${NC}"
        exit 1
    fi
    
    # Check Android SDK
    if [ -z "$ANDROID_HOME" ]; then
        echo -e "${RED}❌ ANDROID_HOME not set. Please set Android SDK path.${NC}"
        exit 1
    fi
    
    # Check Android NDK
    if [ -z "$ANDROID_NDK_HOME" ]; then
        echo -e "${YELLOW}⚠️  ANDROID_NDK_HOME not set. Using default NDK path.${NC}"
        export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/25.1.8937393"
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Setup Rust targets
setup_rust_targets() {
    echo -e "${BLUE}🔧 Setting up Rust targets...${NC}"
    
    for target in "${RUST_TARGETS[@]}"; do
        echo "Adding target: $target"
        rustup target add "$target"
    done
    
    echo -e "${GREEN}✅ Rust targets setup completed${NC}"
}

# Build Rust libraries
build_rust_libs() {
    echo -e "${BLUE}🏗️  Building Rust libraries...${NC}"
    
    cd "$PROJECT_ROOT/brezn"
    
    for target in "${RUST_TARGETS[@]}"; do
        echo "Building for target: $target"
        cargo build --target "$target" --release --lib
    done
    
    echo -e "${GREEN}✅ Rust libraries built successfully${NC}"
}

# Copy Rust libraries to Android project
copy_rust_libs() {
    echo -e "${BLUE}📁 Copying Rust libraries to Android project...${NC}"
    
    cd "$ANDROID_DIR"
    
    # Create jniLibs directories
    for abi in "${ANDROID_ABIS[@]}"; do
        mkdir -p "app/src/main/jniLibs/$abi"
    done
    
    # Copy libraries
    cp "$PROJECT_ROOT/brezn/target/aarch64-linux-android/release/libbrezn.so" \
       "app/src/main/jniLibs/arm64-v8a/" 2>/dev/null || echo "Warning: arm64-v8a library not found"
    
    cp "$PROJECT_ROOT/brezn/target/armv7-linux-androideabi/release/libbrezn.so" \
       "app/src/main/jniLibs/armeabi-v7a/" 2>/dev/null || echo "Warning: armeabi-v7a library not found"
    
    cp "$PROJECT_ROOT/brezn/target/x86_64-linux-android/release/libbrezn.so" \
       "app/src/main/jniLibs/x86_64/" 2>/dev/null || echo "Warning: x86_64 library not found"
    
    cp "$PROJECT_ROOT/brezn/target/i686-linux-android/release/libbrezn.so" \
       "app/src/main/jniLibs/x86/" 2>/dev/null || echo "Warning: x86 library not found"
    
    echo -e "${GREEN}✅ Rust libraries copied to Android project${NC}"
}

# Build Android APK
build_android_apk() {
    echo -e "${BLUE}📱 Building Android APK...${NC}"
    
    cd "$ANDROID_DIR"
    
    # Make gradlew executable
    chmod +x gradlew
    
    # Clean previous builds
    echo "Cleaning previous builds..."
    ./gradlew clean
    
    # Build release APK
    echo "Building release APK..."
    ./gradlew assembleRelease
    
    echo -e "${GREEN}✅ Android APK built successfully${NC}"
}

# Verify build output
verify_build() {
    echo -e "${BLUE}🔍 Verifying build output...${NC}"
    
    cd "$ANDROID_DIR"
    
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
    
    if [ -f "$APK_PATH" ]; then
        APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
        echo -e "${GREEN}✅ APK built successfully: $APK_PATH (Size: $APK_SIZE)${NC}"
        
        # List APK contents
        echo "APK contents:"
        unzip -l "$APK_PATH" | grep -E "(lib/|classes.dex|AndroidManifest.xml)" | head -10
    else
        echo -e "${RED}❌ APK not found at expected location${NC}"
        exit 1
    fi
}

# Generate F-Droid build info
generate_fdroid_info() {
    echo -e "${BLUE}📊 Generating F-Droid build info...${NC}"
    
    cd "$ANDROID_DIR"
    
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
    
    if [ -f "$APK_PATH" ]; then
        echo "Build Information:"
        echo "=================="
        echo "APK Path: $APK_PATH"
        echo "APK Size: $(du -h "$APK_PATH" | cut -f1)"
        echo "Build Time: $(date)"
        echo "Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
        echo "Git Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
        echo ""
        echo "Rust Libraries:"
        for abi in "${ANDROID_ABIS[@]}"; do
            lib_path="app/src/main/jniLibs/$abi/libbrezn.so"
            if [ -f "$lib_path" ]; then
                echo "  $abi: $(du -h "$lib_path" | cut -f1)"
            else
                echo "  $abi: Not found"
            fi
        done
    fi
}

# Main build process
main() {
    echo -e "${BLUE}🚀 Starting Brezn F-Droid build process...${NC}"
    echo ""
    
    check_prerequisites
    echo ""
    
    setup_rust_targets
    echo ""
    
    build_rust_libs
    echo ""
    
    copy_rust_libs
    echo ""
    
    build_android_apk
    echo ""
    
    verify_build
    echo ""
    
    generate_fdroid_info
    echo ""
    
    echo -e "${GREEN}🎉 Build process completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test the APK on a device"
    echo "2. Submit to F-Droid repository"
    echo "3. Update version numbers for next release"
}

# Run main function
main "$@"