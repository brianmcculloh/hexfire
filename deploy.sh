#!/bin/bash
# Simple deployment script for HexFire
# Run this script to deploy to your web server

echo "🚀 HexFire Deployment Script"
echo "=============================="

# Configuration - UPDATE THESE PATHS
LOCAL_PATH="/Users/brianmcculloh/Documents/Websites/Method/Brian McCulloh/spewnicorn/hexfire"
SERVER_USER="your-username"
SERVER_HOST="your-domain.com"
SERVER_PATH="/path/to/your/website"

echo "📁 Local path: $LOCAL_PATH"
echo "🌐 Server: $SERVER_USER@$SERVER_HOST:$SERVER_PATH"
echo ""

# Check if rsync is available
if ! command -v rsync &> /dev/null; then
    echo "❌ rsync not found. Please install rsync or use manual upload."
    exit 1
fi

# Create temporary directory excluding git files
TEMP_DIR="/tmp/hexfire-deploy"
echo "📦 Creating deployment package..."

# Clean up any existing temp directory
rm -rf "$TEMP_DIR"

# Copy files excluding git and other unnecessary files
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='*.log' "$LOCAL_PATH/" "$TEMP_DIR/"

echo "📤 Uploading to server..."
echo "⚠️  Make sure to update the SERVER_USER, SERVER_HOST, and SERVER_PATH variables in this script!"

# Upload to server (uncomment and modify the line below)
# rsync -av --delete "$TEMP_DIR/" "$SERVER_USER@$SERVER_HOST:$SERVER_PATH/"

echo ""
echo "✅ Deployment package ready at: $TEMP_DIR"
echo "📋 Next steps:"
echo "   1. Update SERVER_USER, SERVER_HOST, and SERVER_PATH in this script"
echo "   2. Uncomment the rsync upload line"
echo "   3. Run this script again"
echo ""
echo "🔧 Manual upload alternative:"
echo "   Upload contents of $TEMP_DIR to your web server"
