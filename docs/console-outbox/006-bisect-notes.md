Bisect: adding docs/ (design specs, screenshots, ~39 MB tracked PNGs) to the function bundle broke the Netlify build (exit code 2). Functions + public files alone deploy fine.
Fix: .netlifyignore excludes docs/, tests/, ios/, android/ and other non-deploy dirs from the bundle. No files deleted.
