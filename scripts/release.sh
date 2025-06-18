#!/bin/bash

# Oh My Posh Configuration Release Script
# This script automates the release process for standalone tarballs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Check if S3 configuration is set
check_s3_config() {
    local bucket=$(node -p "require('./package.json').oclif.update.s3.bucket")
    local region=$(node -p "require('./package.json').oclif.update.s3.region")
    
    if [ "$bucket" = "" ] || [ "$region" = "" ]; then
        log_warning "S3 configuration is not complete. Please update package.json with your S3 settings:"
        log_warning "  - bucket: Your S3 bucket name"
        log_warning "  - region: Your S3 region"
        log_warning "  - accessKeyId: Your AWS access key ID"
        log_warning "  - secretAccessKey: Your AWS secret access key"
        log_warning ""
        log_warning "You can also set these via environment variables:"
        log_warning "  - AWS_ACCESS_KEY_ID"
        log_warning "  - AWS_SECRET_ACCESS_KEY"
        return 1
    fi
    return 0
}

# Main release process
main() {
    log_info "Starting Oh My Posh Configuration release process..."
    
    # Check if we have uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_error "You have uncommitted changes. Please commit or stash them before releasing."
        exit 1
    fi
    
    # Get current version
    local current_version=$(node -p "require('./package.json').version")
    log_info "Current version: $current_version"
    
    # Build configurations first
    log_info "Building Oh My Posh configurations..."
    if ! yarn omp:build; then
        log_error "Failed to build configurations"
        exit 1
    fi
    log_success "Configurations built successfully"
    
    # Generate manifest
    log_info "Generating oclif manifest..."
    if ! yarn manifest; then
        log_error "Failed to generate manifest"
        exit 1
    fi
    log_success "Manifest generated successfully"
    
    # Build tarballs
    log_info "Building standalone tarballs for all platforms..."
    if ! yarn pack:all; then
        log_error "Failed to build tarballs"
        exit 1
    fi
    log_success "Tarballs built successfully"
    
    # Check S3 configuration before attempting upload
    if check_s3_config; then
        log_info "S3 configuration found. You can now upload and promote the release:"
        log_info "  yarn release:upload  # Upload tarballs to S3"
        log_info "  yarn release:promote # Promote the release"
        log_info "  yarn release:full    # Do everything in one command"
    else
        log_warning "Skipping upload due to incomplete S3 configuration"
        log_info "Tarballs are available in the dist/ directory"
    fi
    
    log_success "Release preparation completed!"
    log_info "Next steps:"
    log_info "  1. Configure S3 settings in package.json (if not done already)"
    log_info "  2. Run 'yarn release:upload' to upload to S3"
    log_info "  3. Run 'yarn release:promote' to make the release available"
    log_info "  4. Users can then run 'omp update' to get the latest version"
}

# Run main function
main "$@"
