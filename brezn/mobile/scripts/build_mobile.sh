#!/bin/bash

# Brezn Mobile Build Script
# Builds Rust FFI and integrates with React Native

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BREZN_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"

echo -e "${BLUE}🚀 Brezn Mobile Build Script${NC}"
echo -e "${BLUE}==========================${NC}"

# Check if we're in the right directory
if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
    echo -e "${RED}❌ Error: Not in mobile project directory${NC}"
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}❌ Error: Rust/Cargo not found. Please install Rust first.${NC}"
    exit 1
fi

# Check if Android NDK is available (for Android builds)
ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk}"
if [[ ! -d "$ANDROID_NDK_HOME" ]]; then
    echo -e "${YELLOW}⚠️  Warning: Android NDK not found at $ANDROID_NDK_HOME${NC}"
    echo -e "${YELLOW}   Set ANDROID_NDK_HOME environment variable for Android builds${NC}"
fi

# Function to build Rust FFI
build_rust_ffi() {
    echo -e "${BLUE}🔨 Building Rust FFI...${NC}"
    
    cd "$BREZN_ROOT"
    
    # Clean previous builds
    echo -e "${YELLOW}   Cleaning previous builds...${NC}"
    cargo clean
    
    # Build for different targets
    echo -e "${YELLOW}   Building for Android (arm64-v8a)...${NC}"
    cargo build --target aarch64-linux-android --release --lib
    
    echo -e "${YELLOW}   Building for Android (armeabi-v7a)...${NC}"
    cargo build --target armv7-linux-androideabi --release --lib
    
    echo -e "${YELLOW}   Building for Android (x86)...${NC}"
    cargo build --target i686-linux-android --release --lib
    
    echo -e "${YELLOW}   Building for Android (x86_64)...${NC}"
    cargo build --target x86_64-linux-android --release --lib
    
    # Build for iOS (universal binary)
    echo -e "${YELLOW}   Building for iOS...${NC}"
    cargo build --target aarch64-apple-ios --release --lib
    cargo build --target x86_64-apple-ios --release --lib
    
    echo -e "${GREEN}✅ Rust FFI built successfully${NC}"
}

# Function to setup Android build
setup_android_build() {
    echo -e "${BLUE}🤖 Setting up Android build...${NC}"
    
    cd "$PROJECT_ROOT/android"
    
    # Create necessary directories
    mkdir -p app/src/main/cpp/include
    mkdir -p app/src/main/jniLibs/arm64-v8a
    mkdir -p app/src/main/jniLibs/armeabi-v7a
    mkdir -p app/src/main/jniLibs/x86
    mkdir -p app/src/main/jniLibs/x86_64
    
    # Copy header files
    echo -e "${YELLOW}   Copying header files...${NC}"
    cp "$BREZN_ROOT/mobile/include/brezn_ffi.h" app/src/main/cpp/include/
    
    # Copy native libraries
    echo -e "${YELLOW}   Copying native libraries...${NC}"
    cp "$BREZN_ROOT/target/aarch64-linux-android/release/libbrezn.so" app/src/main/jniLibs/arm64-v8a/
    cp "$BREZN_ROOT/target/armv7-linux-androideabi/release/libbrezn.so" app/src/main/jniLibs/armeabi-v7a/
    cp "$BREZN_ROOT/target/i686-linux-android/release/libbrezn.so" app/src/main/jniLibs/x86/
    cp "$BREZN_ROOT/target/x86_64-linux-android/release/libbrezn.so" app/src/main/jniLibs/x86_64/
    
    echo -e "${GREEN}✅ Android build setup complete${NC}"
}

# Function to setup iOS build
setup_ios_build() {
    echo -e "${BLUE}🍎 Setting up iOS build...${NC}"
    
    cd "$PROJECT_ROOT/ios"
    
    # Create necessary directories
    mkdir -p Brezn/BreznNativeModule
    mkdir -p Brezn/Frameworks
    
    # Copy Swift module
    echo -e "${YELLOW}   Copying Swift module...${NC}"
    cp "$BREZN_ROOT/mobile/ios/BreznNativeModule.swift" Brezn/BreznNativeModule/
    
    # Create universal binary for iOS
    echo -e "${YELLOW}   Creating universal binary...${NC}"
    if command -v lipo &> /dev/null; then
        lipo -create \
            "$BREZN_ROOT/target/aarch64-apple-ios/release/libbrezn.a" \
            "$BREZN_ROOT/target/x86_64-apple-ios/release/libbrezn.a" \
            -output Brezn/Frameworks/libbrezn.a
        echo -e "${GREEN}✅ iOS universal binary created${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: lipo not found, skipping universal binary creation${NC}"
    fi
    
    echo -e "${GREEN}✅ iOS build setup complete${NC}"
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Install npm dependencies
    echo -e "${YELLOW}   Installing npm dependencies...${NC}"
    npm install
    
    # Install React Native CLI if not present
    if ! command -v react-native &> /dev/null; then
        echo -e "${YELLOW}   Installing React Native CLI...${NC}"
        npm install -g @react-native-community/cli
    fi
    
    echo -e "${GREEN}✅ Dependencies installed${NC}"
}

# Function to run tests
run_tests() {
    echo -e "${BLUE}🧪 Running tests...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Run TypeScript tests
    echo -e "${YELLOW}   Running TypeScript tests...${NC}"
    npm test
    
    # Run integration tests if available
    if [[ -f "test_integration.sh" ]]; then
        echo -e "${YELLOW}   Running integration tests...${NC}"
        chmod +x test_integration.sh
        ./test_integration.sh
    fi
    
    echo -e "${GREEN}✅ Tests completed${NC}"
}

# Function to build for specific platform
build_platform() {
    local platform=$1
    
    echo -e "${BLUE}🏗️  Building for $platform...${NC}"
    
    cd "$PROJECT_ROOT"
    
    case $platform in
        "android")
            if [[ -d "$ANDROID_NDK_HOME" ]]; then
                echo -e "${YELLOW}   Building Android APK...${NC}"
                npm run build:android
                echo -e "${GREEN}✅ Android build complete${NC}"
            else
                echo -e "${RED}❌ Error: Android NDK not found${NC}"
                exit 1
            fi
            ;;
        "ios")
            echo -e "${YELLOW}   Building iOS app...${NC}"
            npm run build:ios
            echo -e "${GREEN}✅ iOS build complete${NC}"
            ;;
        *)
            echo -e "${RED}❌ Error: Unknown platform '$platform'${NC}"
            echo -e "${YELLOW}   Supported platforms: android, ios${NC}"
            exit 1
            ;;
    esac
}

# Function to show help
show_help() {
    echo -e "${BLUE}Brezn Mobile Build Script${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS] [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build-rust      Build Rust FFI for all platforms"
    echo "  setup-android   Setup Android build environment"
    echo "  setup-ios       Setup iOS build environment"
    echo "  install         Install dependencies"
    echo "  test            Run tests"
    echo "  build-android   Build Android APK"
    echo "  build-ios       Build iOS app"
    echo "  all             Run all steps (default)"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo "  -v, --verbose   Enable verbose output"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all steps"
    echo "  $0 build-rust         # Build only Rust FFI"
    echo "  $0 build-android      # Build only Android"
    echo "  $0 setup-android      # Setup only Android environment"
}

# Main execution
main() {
    local command="all"
    local verbose=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            build-rust|setup-android|setup-ios|install|test|build-android|build-ios|all)
                command=$1
                shift
                ;;
            *)
                echo -e "${RED}❌ Error: Unknown option '$1'${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Set verbose mode
    if [[ "$verbose" == true ]]; then
        set -x
    fi
    
    # Execute command
    case $command in
        "build-rust")
            build_rust_ffi
            ;;
        "setup-android")
            setup_android_build
            ;;
        "setup-ios")
            setup_ios_build
            ;;
        "install")
            install_dependencies
            ;;
        "test")
            run_tests
            ;;
        "build-android")
            build_platform "android"
            ;;
        "build-ios")
            build_platform "ios"
            ;;
        "all")
            echo -e "${BLUE}🚀 Running complete build process...${NC}"
            build_rust_ffi
            setup_android_build
            setup_ios_build
            install_dependencies
            run_tests
            echo -e "${GREEN}🎉 Complete build process finished successfully!${NC}"
            ;;
    esac
}

# Run main function with all arguments
main "$@"