# HexFire Server Deployment Setup (Option 3)

## Step 1: Initial Server Setup

### SSH into your web server
```bash
ssh your-username@your-domain.com
```

### Navigate to your web directory
```bash
cd /path/to/your/website/public_html
# or wherever your web files are served from
```

### Clone the repository
```bash
git clone https://github.com/brianmcculloh/hexfire.git
```

### Set up proper permissions
```bash
# Make sure web server can read the files
chmod -R 755 hexfire/
chmod -R 644 hexfire/*.html hexfire/*.css hexfire/*.js
chmod -R 644 hexfire/src/*.js
chmod -R 644 hexfire/src/systems/*.js
chmod -R 644 hexfire/src/utils/*.js
```

## Step 2: Configure Web Server

### For Apache (.htaccess)
Create `hexfire/.htaccess`:
```apache
# Enable CORS for ES6 modules
Header always set Access-Control-Allow-Origin "*"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type"

# Set MIME types for ES6 modules
AddType application/javascript .js
AddType text/css .css

# Enable compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
</IfModule>
```

### For Nginx
Add to your nginx config:
```nginx
location /hexfire/ {
    # Enable CORS
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";
    
    # Set MIME types
    location ~* \.js$ {
        add_header Content-Type application/javascript;
    }
    
    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
}
```

## Step 3: Automated Updates

### Create update script on server
Create `hexfire/update.sh`:
```bash
#!/bin/bash
echo "🔄 Updating HexFire..."
cd /path/to/your/website/public_html/hexfire
git pull origin main
echo "✅ HexFire updated!"
```

### Make it executable
```bash
chmod +x hexfire/update.sh
```

### Set up cron job for automatic updates (optional)
```bash
# Edit crontab
crontab -e

# Add this line to update every hour (adjust as needed)
0 * * * * /path/to/your/website/public_html/hexfire/update.sh
```

## Step 4: Test Your Setup

### Check if files are accessible
```bash
# Test from server
curl -I http://your-domain.com/hexfire/

# Test from local machine
curl -I http://your-domain.com/hexfire/index.html
```

### Verify ES6 modules work
Open browser console and check for any CORS or module loading errors.

## Step 5: Future Updates Workflow

### When you make changes locally:
1. **Commit and push to GitHub**:
   ```bash
   git add .
   git commit -m "Your update message"
   git push
   ```

2. **Update on server** (choose one):
   
   **Manual update**:
   ```bash
   ssh your-username@your-domain.com
   cd /path/to/your/website/public_html/hexfire
   git pull origin main
   ```
   
   **Or run the update script**:
   ```bash
   ssh your-username@your-domain.com
   /path/to/your/website/public_html/hexfire/update.sh
   ```

## Troubleshooting

### Common Issues:
- **CORS errors**: Make sure web server is configured for CORS
- **404 errors**: Check file paths and permissions
- **Module loading errors**: Verify MIME types are set correctly
- **Permission errors**: Ensure web server user can read files

### Quick Fixes:
```bash
# Fix permissions
chmod -R 755 hexfire/
find hexfire/ -type f -name "*.js" -exec chmod 644 {} \;
find hexfire/ -type f -name "*.html" -exec chmod 644 {} \;
find hexfire/ -type f -name "*.css" -exec chmod 644 {} \;
```

## Your Game URL
Once set up, your game will be available at:
**http://your-domain.com/hexfire/**
