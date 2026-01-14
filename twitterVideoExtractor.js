// ==UserScript==
// @name                Twitter Video URL Extractor
// @version             2.2.0
// @description         Extract and view Twitter video URLs (converts video.twimg to pbs.twimg)
// @author              Custom
// @namespace           twitter-video-extractor
// @icon                https://abs.twimg.com/favicons/twitter.3.ico
// @match               https://twitter.com/*
// @match               https://x.com/*
// @match               https://mobile.twitter.com/*
// @match               https://mobile.x.com/*
// @grant               unsafeWindow
// @run-at              document-start
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // unsafeWindow를 통해 페이지 컨텍스트의 window 접근
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    console.log('[Twitter Video Extractor] Script injected! Using', typeof unsafeWindow !== 'undefined' ? 'unsafeWindow' : 'window');

    // 캡처된 비디오 URL 저장소 (tweet_id -> video URLs)
    const tweetVideoMap = new Map();


    // URL 변경 감지하여 Map 초기화 및 UI 재처리 (SPA 네비게이션 대응)
    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            tweetVideoMap.clear();
            // SPA 네비게이션 시 processed 마커 제거하여 버튼 재추가 가능하게 함
            document.querySelectorAll('.processed-video-extractor').forEach(el => {
                el.classList.remove('processed-video-extractor');
            });
            document.querySelectorAll('.video-extract-btn').forEach(btn => {
                btn.remove();
            });
            console.log('[Twitter Video Extractor] URL changed, cleared video cache and reset UI');
            // 약간의 지연 후 비디오 재처리
            setTimeout(findAndProcessVideos, 300);
            setTimeout(findAndProcessVideos, 1000);
            setTimeout(findAndProcessVideos, 2000);
        }
    }, 300);

    // 현재 페이지 URL에서 Tweet ID 추출 (단일 트윗 페이지인 경우)
    function getCurrentPageTweetId() {
        const match = window.location.href.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    }

    // 현재 페이지 URL에서 유저네임 추출 (단일 트윗 페이지인 경우)
    // 예: https://x.com/username/status/123 -> username
    function getCurrentPageUsername() {
        const match = window.location.href.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/\d+/);
        return match ? match[1].toLowerCase() : null;
    }

    // 단일 트윗 페이지인지 확인
    function isSingleTweetPage() {
        return getCurrentPageTweetId() !== null;
    }

    // video.twimg.com -> pbs.twimg.com 변환
    function convertToPlayableUrl(url) {
        if (!url) return null;
        return url.replace('video.twimg.com', 'pbs.twimg.com');
    }

    // API 응답에서 Tweet ID와 Video URL 매핑 추출
    function extractTweetVideoMapping(responseText) {
        try {
            // JSON 파싱 시도
            const data = JSON.parse(responseText);
            processJsonData(data);
        } catch (e) {
            // JSON이 아닌 경우 정규식으로 추출 시도
            extractMappingWithRegex(responseText);
        }
    }

    // JSON 데이터 재귀적으로 탐색하여 트윗-비디오 매핑 추출
    function processJsonData(obj, currentTweetId = null, currentUsername = null) {
        if (!obj || typeof obj !== 'object') return;

        // 배열인 경우
        if (Array.isArray(obj)) {
            obj.forEach(item => processJsonData(item, currentTweetId, currentUsername));
            return;
        }

        // Tweet ID 찾기 (id_str 또는 rest_id)
        let tweetId = currentTweetId;
        let username = currentUsername;

        if (obj.id_str && /^\d{15,}$/.test(obj.id_str)) {
            tweetId = obj.id_str;
        } else if (obj.rest_id && /^\d{15,}$/.test(obj.rest_id)) {
            tweetId = obj.rest_id;
        }

        // legacy 객체 내부의 id_str도 확인
        if (obj.legacy && obj.legacy.id_str) {
            tweetId = obj.legacy.id_str;
        }

        // 유저네임 추출 (다양한 Twitter API 응답 구조 대응)
        // 1. core.user_results.result.legacy.screen_name
        if (!username && obj.core?.user_results?.result?.legacy?.screen_name) {
            username = obj.core.user_results.result.legacy.screen_name.toLowerCase();
        }
        // 2. user_results.result.legacy.screen_name (core 없이)
        if (!username && obj.user_results?.result?.legacy?.screen_name) {
            username = obj.user_results.result.legacy.screen_name.toLowerCase();
        }
        // 3. result.legacy.screen_name
        if (!username && obj.result?.legacy?.screen_name) {
            username = obj.result.legacy.screen_name.toLowerCase();
        }
        // 4. legacy.user.screen_name (트윗 내 유저 정보)
        if (!username && obj.legacy?.user?.screen_name) {
            username = obj.legacy.user.screen_name.toLowerCase();
        }
        // 5. user.screen_name
        if (!username && obj.user?.screen_name) {
            username = obj.user.screen_name.toLowerCase();
        }
        // 6. author.screen_name
        if (!username && obj.author?.screen_name) {
            username = obj.author.screen_name.toLowerCase();
        }
        // 7. screen_name 직접 (유저 객체인 경우)
        if (!username && obj.screen_name && typeof obj.screen_name === 'string') {
            username = obj.screen_name.toLowerCase();
        }

        // video_info에서 비디오 URL 추출
        if (obj.video_info && obj.video_info.variants && tweetId) {
            // 단일 트윗 페이지에서는 해당 유저의 트윗만 캡처 (댓글 필터링)
            const pageUsername = getCurrentPageUsername();
            if (pageUsername && username && username !== pageUsername) {
                console.log(`[Twitter Video Extractor] Skipping video from @${username} (page is @${pageUsername})`);
                // 다른 유저의 트윗은 건너뛰되, 하위 객체는 계속 탐색
                Object.values(obj).forEach(value => {
                    if (value && typeof value === 'object') {
                        processJsonData(value, null, null);
                    }
                });
                return;
            }

            const videoUrls = [];
            obj.video_info.variants.forEach(variant => {
                if (variant.url && variant.url.includes('.mp4')) {
                    // URL 정리
                    let cleanUrl = variant.url
                        .replace(/\\u002F/g, '/')
                        .replace(/\\/g, '')
                        .split('?')[0];

                    // 해상도 패턴이 있는 URL만 캡처 (/NNNxNNN/)
                    const hasResolution = /\/\d+x\d+\//.test(cleanUrl);

                    if (hasResolution && !videoUrls.includes(cleanUrl)) {
                        videoUrls.push(cleanUrl);
                    }
                }
            });

            if (videoUrls.length > 0) {
                if (!tweetVideoMap.has(tweetId)) {
                    tweetVideoMap.set(tweetId, { urls: [], username: null, captured: Date.now() });
                }

                const existing = tweetVideoMap.get(tweetId);
                // 유저네임 저장 (있으면)
                if (username && !existing.username) {
                    existing.username = username;
                }
                videoUrls.forEach(url => {
                    if (!existing.urls.includes(url)) {
                        existing.urls.push(url);
                        console.log(`[Twitter Video Extractor] Tweet ${tweetId} (@${username || 'unknown'}) -> ${url}`);
                    }
                });
            }
        }

        // extended_entities.media에서도 추출 시도
        if (obj.extended_entities && obj.extended_entities.media && tweetId) {
            obj.extended_entities.media.forEach(media => {
                if (media.video_info) {
                    processJsonData(media, tweetId, username);
                }
            });
        }

        // 모든 하위 객체 탐색
        Object.values(obj).forEach(value => {
            if (value && typeof value === 'object') {
                processJsonData(value, tweetId, username);
            }
        });
    }

    // 정규식으로 매핑 추출 (JSON 파싱 실패 시 폴백)
    function extractMappingWithRegex(responseText) {
        // Tweet ID와 Video URL을 근접성으로 매핑
        // "id_str":"1234567890" ... "url":"https://video.twimg.com/..."

        const tweetIdPattern = /"(?:id_str|rest_id)"\s*:\s*"(\d{15,})"/g;
        const videoUrlPattern = /https?:\/\/video\.twimg\.com\/[^"'\s\\]+\.mp4/g;

        const tweetIds = [];
        const videoUrls = [];

        let match;
        while ((match = tweetIdPattern.exec(responseText)) !== null) {
            tweetIds.push({ id: match[1], index: match.index });
        }

        while ((match = videoUrlPattern.exec(responseText)) !== null) {
            const cleanUrl = match[0].replace(/\\u002F/g, '/').replace(/\\/g, '');
            // 해상도 패턴이 있는 URL만 캡처
            if (/\/\d+x\d+\//.test(cleanUrl)) {
                videoUrls.push({ url: cleanUrl, index: match.index });
            }
        }

        // 각 비디오 URL에 대해 가장 가까운 이전 Tweet ID 찾기
        videoUrls.forEach(({ url, index }) => {
            let closestTweetId = null;
            let minDistance = Infinity;

            tweetIds.forEach(({ id, index: tweetIndex }) => {
                // 비디오 URL 이전의 Tweet ID 중 가장 가까운 것
                if (tweetIndex < index && (index - tweetIndex) < minDistance) {
                    minDistance = index - tweetIndex;
                    closestTweetId = id;
                }
            });

            if (closestTweetId && minDistance < 5000) { // 5000자 이내
                if (!tweetVideoMap.has(closestTweetId)) {
                    tweetVideoMap.set(closestTweetId, { urls: [], captured: Date.now() });
                }

                const existing = tweetVideoMap.get(closestTweetId);
                if (!existing.urls.includes(url)) {
                    existing.urls.push(url);
                    console.log(`[Twitter Video Extractor] Tweet ${closestTweetId} -> ${url} (regex)`);
                }
            }
        });
    }

    // XMLHttpRequest 가로채기 (페이지 컨텍스트)
    const originalXHROpen = pageWindow.XMLHttpRequest.prototype.open;
    const originalXHRSend = pageWindow.XMLHttpRequest.prototype.send;

    pageWindow.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    pageWindow.XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
            try {
                if (this.responseText && this._url) {
                    // Twitter API 응답인 경우만 처리
                    if (this._url.includes('api.') || this._url.includes('graphql')) {
                        extractTweetVideoMapping(this.responseText);
                    }
                }
            } catch (e) {
                // 무시
            }
        });
        return originalXHRSend.apply(this, args);
    };

    // Fetch API 가로채기 (페이지 컨텍스트)
    const originalFetch = pageWindow.fetch;
    pageWindow.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const url = args[0]?.url || args[0];
            if (typeof url === 'string' && (url.includes('api.') || url.includes('graphql'))) {
                const clonedResponse = response.clone();
                const text = await clonedResponse.text();
                extractTweetVideoMapping(text);
            }
        } catch (e) {
            // 무시
        }

        return response;
    };

    // ============ UI 부분 ============

    const extractSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;

    const buttonStyle = `
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.75);
        color: white;
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    `;

    // DOM에서 Tweet ID 추출
    function getTweetIdFromElement(element) {
        // 1. 현재 페이지 URL에서 추출 (단일 트윗 페이지인 경우)
        const pageMatch = window.location.href.match(/\/status\/(\d+)/);

        // 2. 가장 가까운 article 찾기
        const article = element.closest('article');
        if (article) {
            // article 내의 링크에서 Tweet ID 추출
            const timeLink = article.querySelector('a[href*="/status/"] time');
            if (timeLink) {
                const linkHref = timeLink.parentElement.href;
                const match = linkHref.match(/\/status\/(\d+)/);
                if (match) return match[1];
            }

            // 다른 status 링크 찾기
            const statusLinks = article.querySelectorAll('a[href*="/status/"]');
            for (const link of statusLinks) {
                const match = link.href.match(/\/status\/(\d+)/);
                if (match) return match[1];
            }
        }

        // 3. 페이지 URL에서 추출 (폴백)
        if (pageMatch) return pageMatch[1];

        return null;
    }

    // DOM에서 트윗 작성자 유저네임 추출
    function getUsernameFromElement(element) {
        const article = element.closest('article');
        if (!article) return null;

        // 방법 1: article 내의 유저 프로필 링크에서 추출 (첫 번째 링크가 보통 작성자)
        // href가 /@username 또는 /username 형태인 링크 찾기
        const userLinks = article.querySelectorAll('a[href^="/"]');
        for (const link of userLinks) {
            const href = link.getAttribute('href');
            // /username 형태 (status, i, settings 등 제외)
            const match = href.match(/^\/([a-zA-Z0-9_]+)$/);
            if (match) {
                const potentialUsername = match[1].toLowerCase();
                // 시스템 경로 제외
                if (!['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search', 'compose'].includes(potentialUsername)) {
                    return potentialUsername;
                }
            }
        }

        // 방법 2: data-testid="User-Name" 내부에서 @username 찾기
        const userNameDiv = article.querySelector('[data-testid="User-Name"]');
        if (userNameDiv) {
            const spans = userNameDiv.querySelectorAll('span');
            for (const span of spans) {
                const text = span.textContent;
                if (text && text.startsWith('@')) {
                    return text.substring(1).toLowerCase();
                }
            }
        }

        // 방법 3: time 링크의 상위 요소에서 username 추출
        const timeLink = article.querySelector('a[href*="/status/"] time');
        if (timeLink) {
            const href = timeLink.parentElement.getAttribute('href');
            const match = href.match(/^\/([^\/]+)\/status\//);
            if (match) {
                return match[1].toLowerCase();
            }
        }

        return null;
    }

    // DOM에서 직접 비디오 URL 추출 (폴백용)
    // containerElement가 주어지면 해당 요소 내에서만 추출, 없으면 전체 페이지에서 추출
    function extractVideoUrlsFromDOM(containerElement = null) {
        const videoUrls = [];
        const searchRoot = containerElement || document;

        // 지정된 컨테이너 내의 video 요소에서 src 추출
        searchRoot.querySelectorAll('video').forEach(video => {
            // video 요소의 src
            if (video.src && video.src.includes('.mp4')) {
                const url = video.src.split('?')[0];
                if (/\/\d+x\d+\//.test(url) && !videoUrls.includes(url)) {
                    videoUrls.push(url);
                }
            }

            // source 요소들
            video.querySelectorAll('source').forEach(source => {
                if (source.src && source.src.includes('.mp4')) {
                    const url = source.src.split('?')[0];
                    if (/\/\d+x\d+\//.test(url) && !videoUrls.includes(url)) {
                        videoUrls.push(url);
                    }
                }
            });
        });

        // blob URL인 경우 - Performance API에서는 특정 컨테이너 필터링 불가능하므로
        // containerElement가 없을 때만 (전체 페이지 폴백용) 사용
        if (!containerElement) {
            try {
                const entries = performance.getEntriesByType('resource');
                entries.forEach(entry => {
                    if (entry.name && entry.name.includes('video.twimg.com') && entry.name.includes('.mp4')) {
                        const url = entry.name.split('?')[0];
                        if (/\/\d+x\d+\//.test(url) && !videoUrls.includes(url)) {
                            videoUrls.push(url);
                        }
                    }
                });
            } catch (e) {
                // Performance API 접근 실패 시 무시
            }
        }

        console.log(`[Twitter Video Extractor] DOM fallback found ${videoUrls.length} video(s)${containerElement ? ' in specific article' : ' in page'}`);
        return videoUrls;
    }

    // URL 표시 모달
    function showUrlModal(urls, tweetId) {
        const existingModal = document.querySelector('.video-url-modal');
        if (existingModal) existingModal.remove();

        const playableUrls = urls.map(url => convertToPlayableUrl(url));

        const modal = document.createElement('div');
        modal.className = 'video-url-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 해상도별 정렬
        const sortedUrls = playableUrls.sort((a, b) => {
            const resA = a.match(/\/(\d+)x(\d+)\//);
            const resB = b.match(/\/(\d+)x(\d+)\//);
            const pixelsA = resA ? parseInt(resA[1]) * parseInt(resA[2]) : 0;
            const pixelsB = resB ? parseInt(resB[1]) * parseInt(resB[2]) : 0;
            return pixelsB - pixelsA;
        });

        const urlListHtml = sortedUrls.map((url) => {
            const resMatch = url.match(/\/(\d+x\d+)\//);
            const resolution = resMatch ? resMatch[1] : 'Unknown';
            return `
                <div style="margin-bottom: 12px; padding: 12px; background: #192734; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="color: #1d9bf0; font-weight: bold;">📹 ${resolution}</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="copy-single-btn" data-url="${url}" style="
                                padding: 6px 12px;
                                background: #1d9bf0;
                                color: white;
                                border: none;
                                border-radius: 12px;
                                cursor: pointer;
                                font-size: 12px;
                            ">📋 Copy</button>
                            <button class="open-single-btn" data-url="${url}" style="
                                padding: 6px 12px;
                                background: #00ba7c;
                                color: white;
                                border: none;
                                border-radius: 12px;
                                cursor: pointer;
                                font-size: 12px;
                            ">▶️ Open</button>
                        </div>
                    </div>
                    <input type="text" value="${url}" readonly style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #38444d;
                        border-radius: 4px;
                        background: #15202b;
                        color: #8899a6;
                        font-size: 11px;
                        box-sizing: border-box;
                    "/>
                </div>
            `;
        }).join('');

        const content = document.createElement('div');
        content.style.cssText = `
            background: #15202b;
            padding: 24px;
            border-radius: 16px;
            max-width: 700px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        content.innerHTML = `
            <h3 style="color: white; margin: 0 0 8px 0; font-size: 18px;">🎬 Video URLs (pbs.twimg.com)</h3>
            <p style="color: #536471; margin: 0 0 16px 0; font-size: 12px;">Tweet ID: ${tweetId}</p>
            <p style="color: #8899a6; margin: 0 0 16px 0; font-size: 13px;">
                Found ${sortedUrls.length} format(s). Higher resolution first.
            </p>
            ${urlListHtml}
            <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                <button class="close-btn" style="
                    padding: 10px 24px;
                    background: #536471;
                    color: white;
                    border: none;
                    border-radius: 20px;
                    cursor: pointer;
                    font-weight: bold;
                ">Close</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        content.querySelectorAll('.copy-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.url).then(() => {
                    btn.textContent = '✅ Copied!';
                    setTimeout(() => btn.textContent = '📋 Copy', 2000);
                });
            });
        });

        content.querySelectorAll('.open-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.open(btn.dataset.url, '_blank');
            });
        });

        content.querySelector('.close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // 비디오 선택 모달 (매칭 실패 시)
    function showVideoSelectModal() {
        const existingModal = document.querySelector('.video-url-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.className = 'video-url-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const videoList = [];
        tweetVideoMap.forEach((data, tweetId) => {
            if (data.urls.length > 0) {
                const bestUrl = data.urls.sort((a, b) => {
                    const resA = a.match(/\/(\d+)x(\d+)\//);
                    const resB = b.match(/\/(\d+)x(\d+)\//);
                    const pixelsA = resA ? parseInt(resA[1]) * parseInt(resA[2]) : 0;
                    const pixelsB = resB ? parseInt(resB[1]) * parseInt(resB[2]) : 0;
                    return pixelsB - pixelsA;
                })[0];

                const resMatch = bestUrl.match(/\/(\d+x\d+)\//);
                const resolution = resMatch ? resMatch[1] : 'Unknown';

                videoList.push({ tweetId, resolution, urls: data.urls, captured: data.captured });
            }
        });

        // tweetVideoMap이 비어있으면 DOM에서 직접 추출 시도
        if (videoList.length === 0) {
            console.log('[Twitter Video Extractor] tweetVideoMap is empty, trying DOM fallback...');
            const domUrls = extractVideoUrlsFromDOM();
            if (domUrls.length > 0) {
                const pageTweetId = getCurrentPageTweetId() || 'unknown';
                // DOM에서 찾은 URL로 바로 모달 표시
                modal.remove();
                showUrlModal(domUrls, pageTweetId + ' (DOM fallback)');
                return;
            }
        }

        videoList.sort((a, b) => b.captured - a.captured);

        const listHtml = videoList.map(v => `
            <div class="video-item" data-tweet-id="${v.tweetId}" style="
                padding: 16px;
                background: #192734;
                border-radius: 8px;
                margin-bottom: 12px;
                cursor: pointer;
                transition: background 0.2s;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <div style="color: white; font-weight: bold; margin-bottom: 4px;">Tweet: ${v.tweetId}</div>
                    <div style="color: #8899a6; font-size: 12px;">Best: ${v.resolution} | ${v.urls.length} format(s)</div>
                </div>
                <div style="color: #1d9bf0;">▶</div>
            </div>
        `).join('');

        const content = document.createElement('div');
        content.style.cssText = `
            background: #15202b;
            padding: 24px;
            border-radius: 16px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        content.innerHTML = `
            <h3 style="color: white; margin: 0 0 16px 0; font-size: 18px;">🎬 Select Tweet Video</h3>
            <p style="color: #8899a6; margin: 0 0 16px 0; font-size: 13px;">
                ${videoList.length} tweet(s) with videos captured. Select one.
            </p>
            ${videoList.length === 0 ? '<p style="color: #f4212e;">No videos captured yet. Try playing a video first, or refresh the page.</p>' : listHtml}
            <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                <button class="close-btn" style="
                    padding: 10px 24px;
                    background: #536471;
                    color: white;
                    border: none;
                    border-radius: 20px;
                    cursor: pointer;
                    font-weight: bold;
                ">Close</button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        content.querySelectorAll('.video-item').forEach(item => {
            item.addEventListener('mouseenter', () => item.style.background = '#1c3a52');
            item.addEventListener('mouseleave', () => item.style.background = '#192734');
            item.addEventListener('click', () => {
                const tweetId = item.dataset.tweetId;
                const data = tweetVideoMap.get(tweetId);
                if (data) {
                    modal.remove();
                    showUrlModal(data.urls, tweetId);
                }
            });
        });

        content.querySelector('.close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    // 버튼 추가
    function addExtractButton(videoContainer, videoElement) {
        if (videoContainer.querySelector('.video-extract-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'video-extract-btn';
        btn.innerHTML = extractSvg;
        btn.style.cssText = buttonStyle;
        btn.title = 'Extract Video URL';

        btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(29, 155, 240, 0.9)');
        btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(0, 0, 0, 0.75)');

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // DOM에서 작성자 유저네임 추출 (가장 신뢰할 수 있는 정보)
            const articleUsername = getUsernameFromElement(videoElement);
            // URL에서 Tweet ID 추출 (단일 트윗 페이지용)
            const pageTweetId = getCurrentPageTweetId();
            // URL에서 페이지 유저네임 추출
            const pageUsername = getCurrentPageUsername();

            console.log(`[Twitter Video Extractor] Article Author: @${articleUsername}, Page: @${pageUsername}, PageTweetId: ${pageTweetId}`);
            console.log(`[Twitter Video Extractor] tweetVideoMap size: ${tweetVideoMap.size}`);

            // 단일 트윗 페이지인 경우 (/status/ URL)
            if (pageTweetId && tweetVideoMap.size > 0) {
                // 1차: 페이지 유저네임과 일치하는 비디오 찾기
                if (pageUsername) {
                    let matchedByPageUser = null;
                    tweetVideoMap.forEach((data, id) => {
                        // 유저네임이 있으면 매칭, 없으면 캡처 시간으로
                        if (data.username === pageUsername || (!matchedByPageUser && data.urls.length > 0)) {
                            matchedByPageUser = { id, urls: data.urls };
                        }
                    });
                    if (matchedByPageUser && matchedByPageUser.urls.length > 0) {
                        console.log(`[Twitter Video Extractor] Matched by page username @${pageUsername}`);
                        showUrlModal(matchedByPageUser.urls, matchedByPageUser.id);
                        return;
                    }
                }

                // 2차: tweetVideoMap에 뭔가 있으면 가장 최근 것 사용
                let latestTweet = null;
                let latestTime = 0;
                tweetVideoMap.forEach((data, id) => {
                    if (data.captured > latestTime && data.urls.length > 0) {
                        latestTime = data.captured;
                        latestTweet = { id, urls: data.urls };
                    }
                });
                if (latestTweet) {
                    console.log(`[Twitter Video Extractor] Using captured tweet for single page: ${latestTweet.id}`);
                    showUrlModal(latestTweet.urls, latestTweet.id);
                    return;
                }
            }

            // 홈 피드인 경우 (유저네임 기반 매칭)
            if (articleUsername && tweetVideoMap.size > 0) {
                let matchedByUsername = null;
                let latestTime = 0;

                tweetVideoMap.forEach((data, id) => {
                    // 유저네임이 있고 일치하면 우선 선택
                    if (data.username && data.username === articleUsername) {
                        if (data.captured > latestTime) {
                            latestTime = data.captured;
                            matchedByUsername = { id, urls: data.urls, username: data.username };
                        }
                    }
                });

                if (matchedByUsername && matchedByUsername.urls.length > 0) {
                    console.log(`[Twitter Video Extractor] Matched by article username @${articleUsername}: ${matchedByUsername.id}`);
                    showUrlModal(matchedByUsername.urls, matchedByUsername.id);
                    return;
                }
            }

            // 폴백: DOM에서 직접 추출 시도
            console.log(`[Twitter Video Extractor] No username match, trying DOM fallback...`);
            console.log(`[Twitter Video Extractor] Available:`, [...tweetVideoMap.entries()].map(([id, data]) => `${id}(@${data.username})`));

            const article = videoElement.closest('article');
            const domUrls = extractVideoUrlsFromDOM(article);
            if (domUrls.length > 0) {
                showUrlModal(domUrls, 'DOM extracted');
                return;
            }

            // 전체 페이지에서 DOM 추출
            const pageUrls = extractVideoUrlsFromDOM(null);
            if (pageUrls.length > 0) {
                showUrlModal(pageUrls, 'DOM page');
                return;
            }

            // tweetVideoMap에 뭐라도 있으면 선택 모달
            if (tweetVideoMap.size > 0) {
                showVideoSelectModal();
            } else {
                alert('No videos captured yet. Try playing a video first, then click again.');
            }
        });

        const containerStyle = window.getComputedStyle(videoContainer);
        if (containerStyle.position === 'static') {
            videoContainer.style.position = 'relative';
        }

        videoContainer.appendChild(btn);
    }

    // 비디오 요소 찾기 (단일 트윗 페이지에서만 UI 표시)
    function findAndProcessVideos() {
        // 홈 피드 등에서는 UI를 표시하지 않음 - 단일 트윗 페이지에서만 표시
        if (!isSingleTweetPage()) {
            return;
        }

        document.querySelectorAll('video:not(.processed-video-extractor)').forEach(video => {
            video.classList.add('processed-video-extractor');

            let container = video.closest('[data-testid="videoComponent"]')
                || video.closest('[data-testid="tweetPhoto"]')
                || video.parentElement;

            if (container) {
                addExtractButton(container, video);
            }
        });

        document.querySelectorAll("[data-testid='playButton']:not(.processed-video-extractor)").forEach(playBtn => {
            playBtn.classList.add('processed-video-extractor');

            const container = playBtn.closest('[data-testid="videoComponent"]')
                || playBtn.closest('[data-testid="tweetPhoto"]')
                || playBtn.parentElement?.parentElement;

            if (container) {
                const video = container.querySelector('video') || playBtn;
                addExtractButton(container, video);
            }
        });
    }

    // 초기화 완료 플래그
    let initialized = false;

    // 초기화
    function init() {
        if (initialized) return;

        // body가 존재할 때까지 대기
        if (!document.body) {
            setTimeout(init, 50);
            return;
        }

        initialized = true;
        console.log('[Twitter Video Extractor] v1.3.2 Initializing...');

        findAndProcessVideos();

        // MutationObserver로 DOM 변화 감지
        const observer = new MutationObserver((mutations) => {
            // 새로운 노드가 추가되었을 때만 처리
            const hasNewNodes = mutations.some(m => m.addedNodes.length > 0);
            if (hasNewNodes) {
                findAndProcessVideos();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 스크롤 시 재처리
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(findAndProcessVideos, 200);
        });

        // popstate 이벤트로 브라우저 뒤로/앞으로 버튼 감지
        window.addEventListener('popstate', () => {
            console.log('[Twitter Video Extractor] popstate detected');
            setTimeout(findAndProcessVideos, 300);
            setTimeout(findAndProcessVideos, 1000);
        });

        // 초기 로드 시 여러 번 시도 (Twitter 동적 로딩 대응)
        const retryTimes = [100, 300, 500, 1000, 1500, 2000, 3000, 5000];
        retryTimes.forEach(ms => setTimeout(findAndProcessVideos, ms));

        console.log('[Twitter Video Extractor] v1.3.2 Initialized - Direct navigation support');
    }

    // 지속적인 폴링 (외부에서 직접 접근 시 대응)
    // 처음 10초 동안 더 자주 체크
    let pollCount = 0;
    const pollInterval = setInterval(() => {
        pollCount++;
        findAndProcessVideos();
        // 20번 (10초) 후 폴링 중단
        if (pollCount >= 20) {
            clearInterval(pollInterval);
            console.log('[Twitter Video Extractor] Initial polling complete');
        }
    }, 500);

    // 여러 방법으로 초기화 시도 - 즉시 시작 + 모든 이벤트에서 시도
    init();

    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('load', init);

    // readyState 변화 감지
    document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            init();
        }
    });

})();
