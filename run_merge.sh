#!/bin/bash

# Oh My Posh Configuration Builder with Fallback Support
# This script builds the modular Oh My Posh configuration using the new CLI
# and is designed to be run by chezmoi on updates
#
# Features:
# - Attempts to build fresh full configuration first
# - Falls back to pre-distributed minimal configuration on errors
# - Uses the new oclif CLI application

set -e

# Get the repository root directory (parent of scripts directory)
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Configuration
FULL_CONFIG="full.yml"
MINIMAL_CONFIG="minimal.yml"
ACTIVE_CONFIG="config.yml"

# Function to copy configuration
copy_config() {
    local source="$1"
    local target="$2"
    local description="$3"

    # Handle both out/ and root level source files
    local source_path
    if [ -f "$REPO_ROOT/out/$source" ]; then
        source_path="$REPO_ROOT/out/$source"
    elif [ -f "$REPO_ROOT/$source" ]; then
        source_path="$REPO_ROOT/$source"
    else
        echo "❌ Error: Source file not found: $source"
        return 1
    fi

    echo "📄 Copying $description to $REPO_ROOT/out/$target"
    cp "$source_path" "$REPO_ROOT/out/$target"
}

# Function to attempt fallback to pre-distributed minimal configuration
attempt_fallback() {
    echo "🔄 Attempting to use pre-distributed minimal configuration as fallback..."

    if [ -f "$REPO_ROOT/out/$MINIMAL_CONFIG" ]; then
        echo "✅ Pre-distributed minimal configuration found"
        copy_config "$MINIMAL_CONFIG" "$ACTIVE_CONFIG" "pre-distributed minimal configuration"
        echo "⚠️  Warning: Using pre-distributed minimal configuration due to errors with full build"
        echo "🎉 Fallback configuration activated successfully!"
        return 0
    else
        echo "❌ Error: Pre-distributed minimal configuration not found at $REPO_ROOT/out/$MINIMAL_CONFIG"
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
if [ ! -d "$REPO_ROOT/node_modules" ]; then
    echo "📦 Installing dependencies..."
    yarn install
fi

# Try to build the full configuration first
echo "🔨 Building full Oh My Posh configuration..."
if "$REPO_ROOT/bin/dev.js" build full; then
    echo "✅ Full configuration built successfully!"

    # Check if full config was built successfully
    if [ -f "$REPO_ROOT/out/$FULL_CONFIG" ]; then
        copy_config "$FULL_CONFIG" "$ACTIVE_CONFIG" "full configuration"
        echo "🎉 Full configuration activated successfully!"
    else
        echo "❌ Error: Full configuration not found at $REPO_ROOT/out/$FULL_CONFIG"
        if ! attempt_fallback; then
            exit 1
        fi
    fi
else
    echo "❌ Full configuration build failed!"
    if ! attempt_fallback; then
        exit 1
    fi
fi
