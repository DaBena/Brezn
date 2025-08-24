#!/bin/bash

echo "🔍 Testing Brezn build configurations..."

# Test minimal build
echo -e "\n1. Testing minimal build (core only)..."
cargo build --no-default-features --features "core" 2>&1 | tail -10

# Test web build
echo -e "\n2. Testing web build..."
cargo build --no-default-features --features "web" 2>&1 | tail -10

# Test with p2p
echo -e "\n3. Testing with P2P..."
cargo build --no-default-features --features "web,p2p" 2>&1 | tail -10

# Test with encryption
echo -e "\n4. Testing with encryption..."
cargo build --no-default-features --features "web,encryption" 2>&1 | tail -10

# Test full build
echo -e "\n5. Testing full build..."
cargo build --features "full" 2>&1 | tail -10

echo -e "\n✅ Build tests complete!"