#!/bin/bash

echo "🧪 Brezn P2P Network Tests"
echo "=========================="

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

# Check if we're in the right directory
if [ ! -f "Cargo.toml" ]; then
    print_status "ERROR" "Please run this script from the brezn directory"
    exit 1
fi

print_status "INFO" "Starting P2P Network Tests..."

# Clean previous test artifacts
print_status "INFO" "Cleaning previous test artifacts..."
rm -f brezn_test_*.db
rm -f test_*.log

# Run individual tests
print_status "INFO" "Running P2P Network between instances test..."
cargo test test_p2p_network_between_instances --test p2p_network_test -- --nocapture 2>&1 | tee test_p2p_instances.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "P2P Network between instances test passed"
else
    print_status "ERROR" "P2P Network between instances test failed"
fi

print_status "INFO" "Running Peer Discovery test..."
cargo test test_peer_discovery --test p2p_network_test -- --nocapture 2>&1 | tee test_discovery.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Peer Discovery test passed"
else
    print_status "ERROR" "Peer Discovery test failed"
fi

print_status "INFO" "Running Post Synchronization test..."
cargo test test_post_synchronization --test p2p_network_test -- --nocapture 2>&1 | tee test_sync.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Post Synchronization test passed"
else
    print_status "ERROR" "Post Synchronization test failed"
fi

print_status "INFO" "Running Tor Integration test..."
cargo test test_tor_integration --test p2p_network_test -- --nocapture 2>&1 | tee test_tor.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Tor Integration test passed"
else
    print_status "WARNING" "Tor Integration test failed (Tor might not be available)"
fi

print_status "INFO" "Running Network Message Handling test..."
cargo test test_network_message_handling --test p2p_network_test -- --nocapture 2>&1 | tee test_messages.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Network Message Handling test passed"
else
    print_status "ERROR" "Network Message Handling test failed"
fi

print_status "INFO" "Running Error Handling test..."
cargo test test_network_error_handling --test p2p_network_test -- --nocapture 2>&1 | tee test_errors.log
if [ $? -eq 0 ]; then
    print_status "SUCCESS" "Error Handling test passed"
else
    print_status "ERROR" "Error Handling test failed"
fi

# Run all tests together
print_status "INFO" "Running all P2P Network tests..."
cargo test --test p2p_network_test -- --nocapture 2>&1 | tee test_all_p2p.log

# Summary
echo ""
echo "📊 Test Summary:"
echo "================"

# Count passed/failed tests
passed_tests=$(grep -c "test.*passed" test_all_p2p.log || echo "0")
failed_tests=$(grep -c "test.*failed" test_all_p2p.log || echo "0")

print_status "INFO" "Tests passed: $passed_tests"
if [ "$failed_tests" -gt 0 ]; then
    print_status "ERROR" "Tests failed: $failed_tests"
else
    print_status "SUCCESS" "All tests passed!"
fi

echo ""
print_status "INFO" "Test logs saved to:"
echo "  - test_p2p_instances.log"
echo "  - test_discovery.log"
echo "  - test_sync.log"
echo "  - test_tor.log"
echo "  - test_messages.log"
echo "  - test_errors.log"
echo "  - test_all_p2p.log"

echo ""
print_status "INFO" "P2P Network Tests completed!"