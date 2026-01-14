# Twitter Video URL Extractor - Development Story

---

## 1. Overview & Motivation

**Why I Made This:**

The existing Twitter Video Downloader userscript stopped working, so I needed a new solution. Instead of relying on external services (like twittervid.com), I discovered that converting `video.twimg.com` → `pbs.twimg.com` bypasses the 403 error, allowing direct video URL extraction.

**Main Features:**

Finds and extracts playable video URLs from Twitter/X network requests. Displays all available resolutions (320p, 480p, 720p, etc.) with copy and open-in-new-tab functionality.

---

## 2. Tools & Environment

**Tools Used:**

- Claude Opus 4.5
- JavaScript (Userscript)
- Tampermonkey (Chrome browser extension)
- Anti Gravity (IDE)

**References:**

- Original deprecatedCode.js (discontinued Twitter Video Downloader script)
- User-discovered `video.twimg.com` → `pbs.twimg.com` conversion trick

---

## 3. Development Process (Methodology)

### STEP 1: Planning & Initial Prompt

**Initial Prompt:**

> "The old script doesn't work anymore. Changing video.twimg to pbs.twimg makes the video play. I want to create a new script using this."

**Key Discovery:**

- Twitter video URL example: `https://video.twimg.com/amplify_video/.../720x776/xxx.mp4`
- `video.twimg.com` → 403 Error
- `pbs.twimg.com` → Works! ✅

---

### STEP 2: Development & Debugging

#### Issue 1: Blob URL Problem

- Initially tried to extract URL directly from `<video>` tag's `src`
- Result: Returns `blob:https://x.com/...` → Not the actual URL!
- Solution: **Intercept network requests** instead

```javascript
// Intercept XMLHttpRequest and fetch to extract URLs from API responses
XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
        extractTweetVideoMapping(this.responseText);
    });
    return originalXHRSend.apply(this, args);
};
```

#### Issue 2: Wrong Video URLs Displayed

- Problem: All video URLs from the Home timeline were captured
- Cause: API responses contain multiple tweet information
- Solution: **Tweet ID-based mapping**

```javascript
// Map tweet_id to video_url from API response
if (obj.id_str && obj.video_info) {
    tweetVideoMap.set(obj.id_str, videoUrls);
}
```

#### Issue 3: Unknown Resolution URL Filtering

- Problem: URLs showing `best: Unknown` were wrong videos
- Discovery: Only URLs with resolution pattern (`/720x776/`) are actual videos
- Solution: Add regex filter

```javascript
// Only capture URLs with resolution pattern
const hasResolution = /\/\d+x\d+\//.test(cleanUrl);
if (hasResolution) { ... }
```

#### Issue 4: SPA Navigation Cache Problem

- Problem: Previous videos remain when navigating from Home → specific post
- Cause: Twitter is a SPA, so JS memory persists during page navigation
- Solution: **Clear cache on URL change detection**

```javascript
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        tweetVideoMap.clear();
    }
}, 500);
```

---

### STEP 3: Polish & Refinement

**UI/UX Improvements:**

- Extract button (✓ icon) overlay on video
- Modal UI showing resolution-sorted URL list
- Higher resolution listed first
- Copy / Open buttons
- Close modal with ESC key or clicking outside

**Tweet ID Extraction from DOM:**

```javascript
// Extract Tweet ID from time link within article
const timeLink = article.querySelector('a[href*="/status/"] time');
const tweetId = timeLink.parentElement.href.match(/\/status\/(\d+)/)[1];
```

---

## 4. Tips & Tricks

### Key Discovery

- Simply converting `video.twimg.com` → `pbs.twimg.com` bypasses the 403 error!

### Network Interception Tips

- Set `@run-at document-start` to intercept requests before script loads
- Use `response.clone()` to avoid corrupting the original response

### Tweet ID Mapping Tips

- `id_str` or `rest_id` fields in API response contain Tweet ID
- `video_info.variants` array contains resolution-specific URLs
- Regex fallback when JSON parsing fails (proximity-based mapping)

### Important Notes

- Video must be played at least once for URL capture (network request required)
- URLs without resolution pattern may not be actual videos

---

## 5. Results & Downloads

### Final Script Features

| Feature | Description |
|---------|-------------|
| URL Extraction | Captures actual video URLs from network requests |
| Domain Conversion | `video.twimg.com` → `pbs.twimg.com` |
| Resolution Filter | Only shows URLs with `/NNNxNNN/` pattern |
| Tweet ID Matching | Shows only URLs matching the clicked video's tweet |
| SPA Support | Auto-clears cache on URL change |

### How to Use

1. Install Tampermonkey/Violentmonkey
2. **Chrome Extension Permission Setup** (Important!)
   - Go to `chrome://extensions` in Chrome
   - Click **Details** on Tampermonkey
   - Under **Site access** → Select **On specific sites**
   - Add `https://x.com/*` (or select **On all sites**)
3. Create new script → Paste `twitterVideoExtractor.js` contents
4. Navigate to a video post on Twitter/X (e.g., `x.com/user/status/123`)
5. Click ✓ button on top-right of video
6. Copy or open the desired resolution URL

> ⚠️ **Note**: When navigating to x.com from an external link for the first time, the script may not work.
> In this case, the permission setup in step 2 is required.

### Download Link

(Upload to GitHub if needed)

### Version History

- **v1.0.0**: Initial version (blob URL issue)
- **v1.1.0**: Network interception approach
- **v1.2.0**: Video ID-based mapping
- **v1.3.0**: Tweet ID-based mapping + resolution filter + SPA cache clearing

---

## 6. Troubleshooting

### ❌ Button is not visible

- **Cause**: Script not loaded properly
- **Solution**: 
  - Check if Tampermonkey/Violentmonkey is enabled
  - Refresh the page and try again
  - Check browser console for `[Twitter Video Extractor]` logs

### ❌ No URL appears when clicking the button

- **Cause**: Video not loaded yet
- **Solution**: 
  - Click the video play button first (network request required)
  - Click the ✓ button after video starts playing

### ❌ Wrong video URL is displayed

- **Cause**: Cache from previous page remains
- **Solution**: 
  - Refresh the page and try again
  - Or navigate to another page and come back (cache auto-clears on URL change)

### ❌ Extracted URL doesn't play

- **Cause**: Some videos may require authentication
- **Solution**: 
  - Try a different resolution URL
  - Make sure you're logged into Twitter

---

## 7. Future Improvements

### 🔧 Planned Fixes

- [ ] Fix UI not appearing on posts containing both images and videos

### 💡 Contributing

Please report bugs or suggest features via GitHub Issues!
