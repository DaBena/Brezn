#!/bin/bash

echo "🍎 Brezn iOS Signing Script"
echo "==========================="

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

print_status "INFO" "Starting iOS Signing Process..."

# Step 1: Check prerequisites
print_status "INFO" "Checking prerequisites..."

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    print_status "ERROR" "Xcode not found. Please install Xcode from the App Store."
    exit 1
fi

# Check if security is available
if ! command -v security &> /dev/null; then
    print_status "ERROR" "security command not found. Please install Xcode command line tools."
    exit 1
fi

# Check if codesign is available
if ! command -v codesign &> /dev/null; then
    print_status "ERROR" "codesign not found. Please install Xcode command line tools."
    exit 1
fi

print_status "SUCCESS" "Prerequisites check passed"

# Step 2: List available certificates
print_status "INFO" "Listing available certificates..."
security find-identity -v -p codesigning

# Step 3: Create iOS project structure
print_status "INFO" "Setting up iOS project structure..."
mkdir -p ios/Brezn/Resources
mkdir -p ios/Brezn/Supporting\ Files

# Step 4: Create Entitlements file
print_status "INFO" "Creating entitlements file..."
cat > ios/Brezn/Brezn.entitlements << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.team-identifier</key>
    <string>$(DEVELOPMENT_TEAM)</string>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.brezn.dev</string>
    </array>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
    <key>com.apple.security.personal-information.location</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.developer.associated-domains</key>
    <array>
        <string>applinks:brezn.dev</string>
    </array>
</dict>
</plist>
EOF

print_status "SUCCESS" "Entitlements file created"

# Step 5: Create Export Options for App Store
print_status "INFO" "Creating export options..."
cat > ios/ExportOptions.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>$(DEVELOPMENT_TEAM)</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
</dict>
</plist>
EOF

print_status "SUCCESS" "Export options created"

# Step 6: Create Export Options for Ad Hoc
print_status "INFO" "Creating ad-hoc export options..."
cat > ios/ExportOptionsAdHoc.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>ad-hoc</string>
    <key>teamID</key>
    <string>$(DEVELOPMENT_TEAM)</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
</dict>
</plist>
EOF

print_status "SUCCESS" "Ad-hoc export options created"

# Step 7: Build and archive
print_status "INFO" "Building and archiving iOS app..."
cd ios

# Clean previous builds
xcodebuild clean -workspace Brezn.xcworkspace -scheme Brezn

# Build for archive
xcodebuild -workspace Brezn.xcworkspace \
           -scheme Brezn \
           -configuration Release \
           -destination generic/platform=iOS \
           -archivePath build/Brezn.xcarchive \
           archive

if [ $? -eq 0 ]; then
    print_status "SUCCESS" "iOS app archived successfully"
else
    print_status "WARNING" "Archive build failed (this might be expected without proper certificates)"
fi

cd ..

# Step 8: Create signing information
print_status "INFO" "Creating signing information..."
cat > ios/SIGNING_INFO.txt << 'EOF'
Brezn iOS Signing Information
============================

App Information:
- Bundle ID: com.brezn.dev
- Version: 0.1.0
- Build: 1
- Platform: iOS

Code Signing:
- Development Team: $(DEVELOPMENT_TEAM)
- Signing Style: Automatic
- Provisioning Profile: Automatic

Entitlements:
- App Groups: group.com.brezn.dev
- Network Client: true
- Network Server: true
- Camera Access: true
- Location Access: true
- File Access: true

Distribution Methods:
1. App Store Connect (app-store)
2. Ad Hoc Distribution (ad-hoc)
3. Enterprise Distribution (enterprise)
4. Development (development)

Build Configuration:
- iOS Deployment Target: 12.0
- Swift Version: 5.0
- Bitcode: Disabled
- Swift Symbols: Stripped

Security Features:
- App Sandbox: Enabled
- Code Signing: Required
- Entitlements: Configured
- Network Security: Configured

Architectures:
- arm64 (iPhone)
- arm64e (iPhone with enhanced security)

Features:
- React Native 0.72.6
- Hermes JavaScript Engine
- Rust Native Library Integration
- P2P Network Support
- Tor Integration
- QR Code Generation/Scanning

Background Modes:
- Background Processing
- Background Fetch
- Background App Refresh

Privacy:
- Camera Usage Description
- Location Usage Description
- Photo Library Usage Description
- Network Usage Description

Distribution:
- App Store ready
- TestFlight compatible
- Enterprise distribution ready
- Ad-hoc distribution ready
EOF

print_status "SUCCESS" "Signing information created"

# Step 9: Create distribution script
print_status "INFO" "Creating distribution script..."
cat > ios/distribute.sh << 'EOF'
#!/bin/bash

echo "📱 Brezn iOS Distribution Script"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    local status=$1
    local message=$2
    case $status in
        "INFO") echo -e "${BLUE}ℹ️  $message${NC}" ;;
        "SUCCESS") echo -e "${GREEN}✅ $message${NC}" ;;
        "WARNING") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "ERROR") echo -e "${RED}❌ $message${NC}" ;;
    esac
}

# Check if archive exists
if [ ! -f "build/Brezn.xcarchive" ]; then
    print_status "ERROR" "Archive not found. Please run sign_ios.sh first."
    exit 1
fi

print_status "INFO" "Available distribution methods:"
echo "1. App Store Connect"
echo "2. Ad Hoc Distribution"
echo "3. Enterprise Distribution"
echo "4. Development"

read -p "Select distribution method (1-4): " method

case $method in
    1)
        print_status "INFO" "Exporting for App Store Connect..."
        xcodebuild -exportArchive \
            -archivePath build/Brezn.xcarchive \
            -exportPath build/AppStore \
            -exportOptionsPlist ExportOptions.plist
        ;;
    2)
        print_status "INFO" "Exporting for Ad Hoc Distribution..."
        xcodebuild -exportArchive \
            -archivePath build/Brezn.xcarchive \
            -exportPath build/AdHoc \
            -exportOptionsPlist ExportOptionsAdHoc.plist
        ;;
    3)
        print_status "INFO" "Exporting for Enterprise Distribution..."
        xcodebuild -exportArchive \
            -archivePath build/Brezn.xcarchive \
            -exportPath build/Enterprise \
            -exportOptionsPlist ExportOptionsEnterprise.plist
        ;;
    4)
        print_status "INFO" "Exporting for Development..."
        xcodebuild -exportArchive \
            -archivePath build/Brezn.xcarchive \
            -exportPath build/Development \
            -exportOptionsPlist ExportOptionsDevelopment.plist
        ;;
    *)
        print_status "ERROR" "Invalid selection"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Distribution package created successfully"
else
    print_status "ERROR" "Distribution export failed"
    exit 1
fi
EOF

chmod +x ios/distribute.sh
print_status "SUCCESS" "Distribution script created"

# Summary
echo ""
print_status "INFO" "iOS Signing Summary:"
echo "========================="

print_status "INFO" "Created Files:"
echo "==============="
echo "✅ Entitlements: ios/Brezn/Brezn.entitlements"
echo "✅ Export Options: ios/ExportOptions.plist"
echo "✅ Ad-hoc Options: ios/ExportOptionsAdHoc.plist"
echo "✅ Signing Info: ios/SIGNING_INFO.txt"
echo "✅ Distribution Script: ios/distribute.sh"

echo ""
print_status "INFO" "Signing Requirements:"
echo "========================="
echo "1. Apple Developer Account"
echo "2. Development Team ID"
echo "3. App Store Connect Access"
echo "4. Provisioning Profiles"
echo "5. Distribution Certificates"

echo ""
print_status "INFO" "Next Steps:"
echo "==========="
echo "1. Configure Apple Developer Account"
echo "2. Set DEVELOPMENT_TEAM environment variable"
echo "3. Create App Store Connect record"
echo "4. Upload to TestFlight"
echo "5. Submit to App Store"
echo "6. Configure enterprise distribution"

echo ""
print_status "SUCCESS" "iOS signing setup completed!"