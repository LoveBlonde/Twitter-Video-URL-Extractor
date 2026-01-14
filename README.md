# Twitter Video URL Extractor 제작기

---

## 1. 개요 및 제작 의도

**제작 동기:**

기존 Twitter Video Downloader 유저스크립트가 작동하지 않게 되어 새로운 방법이 필요했습니다. 외부 서비스(twittervid.com)에 의존하지 않고, `video.twimg.com` → `pbs.twimg.com` 도메인 변환으로 403 에러를 우회하여 직접 비디오 URL을 추출하는 스크립트를 만들게 되었습니다.

**주요 기능/용도:**

Twitter/X의 네트워크 요청에서 브라우저로 바로 재생 가능한 비디오 URL을 찾아 추출합니다. 해상도별(320p, 480p, 720p 등) URL을 모두 표시하며, 복사/새 탭 열기 기능을 지원합니다.

---

## 2. 사용 도구 및 환경

**사용 모델/툴:**

- Claude Opus 4.5
- JavaScript (Userscript)
- Tampermonkey (크롬 브라우저 확장 프로그램)
- Anti Gravity (IDE)

**참고한 자료:**

- 기존 deprecatedCode.js (작동 중단된 Twitter Video Downloader 스크립트)
- 사용자가 직접 발견한 `video.twimg.com` → `pbs.twimg.com` 변환 트릭

---

## 3. 상세 제작 과정 (Methodology)

### STEP 1: 기획 및 프롬프트 구성

**초기 프롬프트:**

> "기존 스크립트가 작동 안 함. video.twimg를 pbs.twimg로 변경하면 비디오가 재생됨. 이걸 응용해서 새 스크립트를 만들고 싶음."

**핵심 발견:**

- Twitter 비디오 URL 예시: `https://video.twimg.com/amplify_video/.../720x776/xxx.mp4`
- `video.twimg.com` → 403 에러
- `pbs.twimg.com` → 정상 재생 ✅

---

### STEP 2: 제작 및 수정 과정

#### 시행착오 1: blob URL 문제

- 처음에는 `<video>` 태그의 `src`에서 직접 URL을 추출하려 함
- 결과: `blob:https://x.com/...` 반환 → 실제 URL이 아님!
- 해결: **네트워크 요청 가로채기 방식**으로 변경

```javascript
// XMLHttpRequest와 fetch를 가로채서 API 응답에서 URL 추출
XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
        extractTweetVideoMapping(this.responseText);
    });
    return originalXHRSend.apply(this, args);
};
```

#### 시행착오 2: 엉뚱한 비디오 URL 표시

- 문제: Home 타임라인의 모든 비디오 URL이 캡처됨
- 원인: API 응답에 여러 트윗 정보가 포함됨
- 해결: **Tweet ID 기반 매핑** 도입

```javascript
// API 응답에서 tweet_id와 video_url을 정확하게 매핑
if (obj.id_str && obj.video_info) {
    tweetVideoMap.set(obj.id_str, videoUrls);
}
```

#### 시행착오 3: Unknown 해상도 URL 필터링

- 문제: `best: Unknown`으로 표시되는 URL이 엉뚱한 영상
- 발견: 해상도 패턴(`/720x776/`)이 있는 URL만 실제 비디오
- 해결: 정규식 필터 추가

```javascript
// 해상도 패턴이 있는 URL만 캡처
const hasResolution = /\/\d+x\d+\//.test(cleanUrl);
if (hasResolution) { ... }
```

#### 시행착오 4: SPA 네비게이션 캐시 문제

- 문제: Home → 특정 게시물로 이동 시 이전 비디오들이 남아있음
- 원인: Twitter는 SPA라서 페이지 이동 시 JS 메모리가 유지됨
- 해결: **URL 변경 감지하여 캐시 초기화**

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

### STEP 3: 디테일 보정

**UI/UX 개선:**

- 비디오 위에 추출 버튼 (✓ 아이콘) 오버레이
- 모달 UI로 해상도별 URL 목록 표시
- 높은 해상도 우선 정렬
- Copy / Open 버튼
- ESC 키 또는 바깥 클릭으로 모달 닫기

**DOM에서 Tweet ID 추출 로직:**

```javascript
// article 내의 time 링크에서 Tweet ID 추출
const timeLink = article.querySelector('a[href*="/status/"] time');
const tweetId = timeLink.parentElement.href.match(/\/status\/(\d+)/)[1];
```

---

## 4. 꿀팁 및 노하우

### 핵심 발견

- `video.twimg.com` → `pbs.twimg.com` 변환만으로 403 에러 우회 가능!

### 네트워크 가로채기 팁

- `@run-at document-start`로 설정해야 스크립트 시작 전 요청도 가로챌 수 있음
- `response.clone()`을 사용해야 원본 응답을 손상시키지 않음

### Tweet ID 매핑 팁

- API 응답에서 `id_str` 또는 `rest_id` 필드가 Tweet ID
- `video_info.variants` 배열에 해상도별 URL이 포함됨
- JSON 파싱 실패 시 정규식 폴백 (근접성 기반 매핑)

### 주의사항

- 비디오를 한 번 이상 재생해야 URL이 캡처됨 (네트워크 요청 발생 필요)
- 해상도 패턴이 없는 URL은 실제 비디오가 아닐 수 있음

---

## 5. 결과물 및 자료 공유

### 최종 스크립트 기능

| 기능 | 설명 |
|------|------|
| URL 추출 | 네트워크 요청에서 실제 비디오 URL 캡처 |
| 도메인 변환 | `video.twimg.com` → `pbs.twimg.com` |
| 해상도 필터 | `/NNNxNNN/` 패턴이 있는 URL만 표시 |
| Tweet ID 매칭 | 클릭한 비디오의 트윗에 해당하는 URL만 표시 |
| SPA 대응 | URL 변경 시 캐시 자동 초기화 |

### 사용 방법

1. Tampermonkey/Violentmonkey 설치
2. **Chrome 확장프로그램 권한 설정** (중요!)
   - Chrome 주소창에 `chrome://extensions` 입력
   - Tampermonkey **세부정보** 클릭
   - **사이트 액세스** → **특정 사이트에서** 선택
   - `https://x.com/*` 추가 (또는 **모든 사이트에서** 선택)
3. 새 스크립트 생성 → `twitterVideoExtractor.js` 내용 붙여넣기
4. Twitter/X에서 동영상 게시물 페이지로 이동 (예: `x.com/user/status/123`)
5. 비디오 우측 상단 ✓ 버튼 클릭
6. 원하는 해상도의 URL 복사 또는 새 탭에서 열기

> ⚠️ **주의**: 외부 링크에서 처음 x.com으로 이동 시 스크립트가 작동하지 않을 수 있습니다.
> 이 경우 위 2번의 권한 설정이 필요합니다.

### 배포 링크

(필요시 GitHub 등에 업로드)

### 버전 히스토리

- **v1.0.0**: 초기 버전 (blob URL 문제)
- **v1.1.0**: 네트워크 가로채기 방식
- **v1.2.0**: Video ID 기반 매핑
- **v1.3.0**: Tweet ID 기반 매핑 + 해상도 필터 + SPA 캐시 초기화

---

## 6. Troubleshooting (문제 해결)

### ❌ 버튼이 보이지 않아요

- **원인**: 스크립트가 제대로 로드되지 않음
- **해결**: 
  - Tampermonkey/Violentmonkey가 활성화되어 있는지 확인
  - 페이지 새로고침 후 다시 시도
  - 브라우저 콘솔에서 `[Twitter Video Extractor]` 로그 확인

### ❌ 버튼을 눌러도 URL이 안 나와요

- **원인**: 비디오가 아직 로드되지 않음
- **해결**: 
  - 비디오 재생 버튼을 먼저 클릭 (네트워크 요청 발생 필요)
  - 비디오가 재생된 후 ✓ 버튼 클릭

### ❌ 엉뚱한 비디오 URL이 나와요

- **원인**: 이전 페이지의 캐시가 남아있음
- **해결**: 
  - 페이지 새로고침 후 다시 시도
  - 또는 다른 페이지로 이동 후 돌아오기 (URL 변경 시 캐시 자동 초기화)

### ❌ 추출한 URL이 재생되지 않아요

- **원인**: 일부 비디오는 인증이 필요할 수 있음
- **해결**: 
  - 다른 해상도 URL 시도
  - Twitter에 로그인된 상태에서 시도

---

## 7. 향후 개선 사항 (Future Improvements)

### 🔧 예정된 수정

- [ ] 이미지와 동영상이 함께 올라온 게시물에서 UI가 표시되지 않는 문제 해결

### 💡 기여 방법

버그 리포트나 기능 제안은 GitHub Issues에 남겨주세요!
