# HexFire Local Development Workflow

## Quick Commands for Development

### After making changes locally:
```bash
# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Add mouse wheel scrolling feature"

# Push to GitHub
git push
```

### Then update your live server:
```bash
# SSH into your server
ssh brianmcc@brianmcculloh.com

# Navigate to hexfire directory
cd /public_html/spewnicorn.com/hexfire

# Run the update script
./update.sh
```

## Development Tips

### Test Locally First
```bash
# Serve locally (if you have Python)
python3 -m http.server 8000

# Or use Node.js
npx serve .

# Then visit http://localhost:8000
```

### Check for Issues
- **Browser Console**: Check for JavaScript errors
- **Network Tab**: Verify all files load correctly
- **ES6 Modules**: Ensure modules load without CORS errors

### Common Git Workflow
```bash
# Check status
git status

# See what changed
git diff

# Add specific files
git add src/systems/mapScrollSystem.js

# Commit with message
git commit -m "Fix mouse wheel scrolling speed"

# Push changes
git push
```

## Server Commands Reference

### Initial Server Setup
```bash
# Clone repository
git clone https://github.com/brianmcculloh/hexfire.git

# Set permissions
chmod -R 755 hexfire/
chmod -R 644 hexfire/*.html hexfire/*.css hexfire/*.js
```

### Regular Updates
```bash
# Quick update
cd /path/to/hexfire && ./update.sh

# Manual update
cd /path/to/hexfire && git pull origin main
```

### Troubleshooting
```bash
# Check git status
git status

# Check logs
git log --oneline -5

# Reset if needed (be careful!)
git reset --hard origin/main
```
