#!/bin/bash

# Oh My Posh Configuration Merger with Fallback Support
# This script merges the modular Oh My Posh configuration
# and is designed to be run by chezmoi on updates
#
# Features:
# - Builds both full and minimal configurations
# - Uses minimal config as fallback on errors
# - Extensible for additional variants

set -e

# Change to the script directory
cd "$(dirname "$0")"

# Configuration
FULL_CONFIG="full.yml"
MINIMAL_CONFIG="minimal.yml"
ACTIVE_CONFIG="config.yml"

# Function to copy configuration with backup
copy_config() {
    local source="$1"
    local target="$2"
    local description="$3"

    if [ -f "$target" ]; then
        echo "📋 Backing up existing $target to ${target}.bak"
        cp "$target" "${target}.bak"
    fi
    echo "📄 Copying $description to $target"
    cp "$source" "$target"
}

# Function to attempt fallback
attempt_fallback() {
    echo "🔄 Attempting to use minimal configuration as fallback..."

    if [ -f "dist/$MINIMAL_CONFIG" ]; then
        echo "✅ Minimal configuration found, using as fallback"
        copy_config "dist/$MINIMAL_CONFIG" "$ACTIVE_CONFIG" "minimal configuration"
        echo "⚠️  Warning: Using minimal configuration due to errors with full build"
        echo "🎉 Fallback configuration activated successfully!"
        return 0
    else
        echo "❌ Error: Minimal configuration not found at dist/$MINIMAL_CONFIG"
        echo "❌ No fallback available - build completely failed"
        return 1
    fi
}

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

# Run the merge to build all variants
echo "🔨 Building Oh My Posh configurations..."
if yarn merge; then
    echo "✅ Build completed successfully!"

    # Check if full config was built successfully
    if [ -f "dist/$FULL_CONFIG" ]; then
        copy_config "dist/$FULL_CONFIG" "$ACTIVE_CONFIG" "full configuration"
        echo "🎉 Full configuration activated successfully!"

        # Also make minimal config available if it exists
        if [ -f "dist/$MINIMAL_CONFIG" ]; then
            echo "📄 Minimal configuration also available at dist/$MINIMAL_CONFIG"
        fi
    else
        echo "❌ Error: Full configuration not found at dist/$FULL_CONFIG"
        if ! attempt_fallback; then
            exit 1
        fi
    fi
else
    echo "❌ Build failed!"
    if ! attempt_fallback; then
        exit 1
    fi
fi
