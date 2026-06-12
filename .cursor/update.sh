#!/bin/bash
# HexFire Server Update Script
# Place this file in your web server's hexfire directory

echo "🔄 Updating HexFire..."
echo "======================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 Current directory: $SCRIPT_DIR"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository!"
    echo "   Make sure you're in the hexfire directory that was cloned from GitHub"
    exit 1
fi

# Check for updates
echo "🔍 Checking for updates..."
git fetch origin

# Check if there are any updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ HexFire is already up to date!"
else
    echo "📥 Updates available. Pulling latest changes..."
    git pull origin main
    
    # Set proper permissions after update
    echo "🔧 Setting file permissions..."
    chmod -R 755 .
    find . -type f -name "*.js" -exec chmod 644 {} \;
    find . -type f -name "*.html" -exec chmod 644 {} \;
    find . -type f -name "*.css" -exec chmod 644 {} \;
    
    echo "✅ HexFire updated successfully!"
    echo "🌐 Your game should now be live with the latest changes"
fi

echo ""
echo "📋 Next steps:"
echo "   - Test your game at your domain"
echo "   - Check browser console for any errors"
echo "   - Verify all features work correctly"
