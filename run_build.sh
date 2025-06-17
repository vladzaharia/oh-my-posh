#!/bin/bash

# Oh My Posh Configuration Builder
# This script builds the modular Oh My Posh configuration
# and is designed to be run by chezmoi on updates

set -e

# Change to the script directory
cd "$(dirname "$0")"

# Check if yarn is available
if ! command -v yarn &> /dev/null; then
    echo "❌ Error: yarn is not installed or not in PATH"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
fi

# Run the build
echo "🔨 Building Oh My Posh configuration..."
yarn build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    
    # Copy the built config to the expected location if it exists
    if [ -f "dist/config.yml" ]; then
        if [ -f "config.yml" ]; then
            echo "📋 Backing up existing config.yml to config.yml.bak"
            cp config.yml config.yml.bak
        fi
        echo "📄 Copying built configuration to config.yml"
        cp dist/config.yml config.yml
        echo "🎉 Configuration updated successfully!"
    else
        echo "❌ Error: Built configuration not found at dist/config.yml"
        exit 1
    fi
else
    echo "❌ Build failed!"
    exit 1
fi
