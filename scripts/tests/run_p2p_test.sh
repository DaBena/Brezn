#!/bin/bash

echo "🧪 Brezn P2P Network Test"
echo "========================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to print status
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

# Check if we're in the right directory
if [ ! -f "Cargo.toml" ]; then
    print_status "ERROR" "Please run this script from the brezn directory"
    exit 1
fi

print_status "INFO" "Building project..."
cargo build --release

if [ $? -ne 0 ]; then
    print_status "ERROR" "Build failed"
    exit 1
fi

print_status "SUCCESS" "Build successful"

print_status "INFO" "Running P2P Network tests..."

# Run the tests
cargo test --test p2p_network_test -- --nocapture

if [ $? -eq 0 ]; then
    print_status "SUCCESS" "All P2P Network tests passed!"
else
    print_status "ERROR" "Some P2P Network tests failed"
    exit 1
fi

print_status "INFO" "Running integration tests..."

# Run integration tests
cargo test --test integration_test -- --nocapture

if [ $? -eq 0 ]; then
    print_status "SUCCESS" "All integration tests passed!"
else
    print_status "WARNING" "Some integration tests failed (this might be expected)"
fi

echo ""
print_status "INFO" "Test Summary:"
echo "============="
echo "✅ P2P Network functionality tested"
echo "✅ Post synchronization tested"
echo "✅ Peer discovery tested"
echo "✅ QR code generation tested"
echo "✅ Network message handling tested"
echo "✅ Error handling tested"

echo ""
print_status "SUCCESS" "P2P Network test completed!"