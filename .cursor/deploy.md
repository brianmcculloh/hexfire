# HexFire Deployment Guide

## Manual Deployment to Your Web Server

### Option 1: Direct File Upload
1. **Compress the project files** (excluding .git folder)
2. **Upload to your web server** via FTP/SFTP/cPanel
3. **Extract files** to your domain's public directory
4. **Ensure proper permissions** (644 for files, 755 for directories)

### Option 2: Git Clone on Server
1. **SSH into your web server**
2. **Clone the repository**:
   ```bash
   git clone https://github.com/brianmcculloh/hexfire.git
   ```
3. **Set up automatic updates** (see below)

### Option 3: Automated Deployment Script
Create a deployment script that pulls latest changes and updates your live site.

## File Structure for Web Server
```
your-domain.com/
├── index.html
├── style.css
├── README.md
├── TODO.md
└── src/
    ├── config.js
    ├── gameLoop.js
    ├── main.js
    └── systems/
    └── utils/
```

## Important Notes
- **No build process needed** - pure HTML/CSS/JS
- **ES6 modules work** in modern browsers
- **HTTPS recommended** for better performance and security
- **CORS headers** may be needed if loading from different domains

## Testing Deployment
1. Upload files to your server
2. Visit your domain
3. Test all game features including mouse wheel scrolling
4. Check browser console for any errors
