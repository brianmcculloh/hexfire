# Hexfire global leaderboard (daily + all-time)
#
# 1. Deploy this `api/` folder next to index.html (same origin as the game).
# 2. PHP with PDO SQLite must be enabled (standard on most shared hosts).
# 3. Make `api/data/` writable by the web server:
#      chmod 775 api/data
# 4. No database username/password is required for SQLite.
# 5. CONFIG.LEADERBOARD_API_URL in src/config.js should be `api/leaderboard.php`
#    (already the default). Use a full https:// URL if the Steam build is not
#    served from this same origin.
#
# The SQLite file is created automatically at api/data/hexfire-leaderboard.sqlite
# on the first request. `api/data/.htaccess` blocks public download of that file.
#
# Local `python3 -m http.server` cannot run PHP — test the board against the
# live host, or `php -S localhost:8080` from the repo root.
