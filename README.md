# Azest_Kingscrown Personal Homepage & Infra Dashboard

SvelteKit 3 + Svelte 5 + Tailwind CSS v4 기반의 개인 홈페이지 및 서버/인프라 관리 대시보드입니다.  
Tremor Dashboard 스타일의 UI로 서버 상태 모니터링, Discord 실시간 상태(Lanyard API), Cloudflare DDNS 관리, Docker Minecraft 서버 제어, 파일 호스팅 기능을 제공합니다.

## Tech Stack

- **Framework**: SvelteKit 3 (`@sveltejs/kit` + `@sveltejs/adapter-node`)
- **UI**: Svelte 5 Runes, Tailwind CSS v4, Tremor Dashboard aesthetic (`Indigo` accent, Dark/Light/System theme)
- **Auth**: Custom Discord OAuth2 + HMAC-SHA256 Signed HttpOnly Session + TOTP (`otplib`)
- **Runtime**: Node.js 24, TypeScript, Vite 8

## Key Features

- **Overview (`/`)**: 실시간 서버 리소스 모니터링(`/api/status`), Discord 상태 카드(Lanyard API), GitHub/Tokscale 통계 프록시(`/api/proxy-image`).
- **DDNS 관리 (`/ddns`)**: Discord 화이트리스트 기반 로그인, 기기별 Cloudflare DNS A 레코드 동적 갱신(`/api/ddns/update`, `/nic/update`), 토큰 재발급 및 OS별 PM2 설정 가이드.
- **Minecraft 제어 (`/minecraft`)**: Docker 컨테이너 상태 조회 및 시작/중지 제어(`/api/server`).
- **File Hosting (`/hosting`)**: 3중 TOTP 관리자 인증 기반 파일 업로드(최대 95MB)·삭제·서빙(`/uploads/[filename]`, 엄격 CSP 적용).
- **Admin 대시보드 (`/admin`)**: 3중 TOTP 인증(`ADMIN_OTP_SECRET`, `_2`, `_3`), 화이트리스트 관리, 제어 로그 조회.
- **Subdomain Routing**: `chzzk.` 서브도메인 리라우팅(`src/hooks.ts`) 및 정적 가이드 문서(`static/docs/`).
- **Bilingual i18n (KO / EN)**: `Accept-Language` 및 `User-Agent` 기반 한국어/영어 자동 SSR 감지, 쿠키(`azest_lang`) 기반 수동 언어 전환 토글(일반 페이지·공용 컴포넌트·정적 가이드 문서 지원, 관리자·DDNS 페이지 제외).

## Getting Started

1. 의존성 설치:
   ```bash
   npm install
   ```

2. 환경변수 설정:
   ```bash
   cp .env.example .env.local
   ```
   `.env.local`에 Discord OAuth2, Cloudflare API, TOTP 시크릿 등 실제 값을 입력합니다.

3. 개발 서버 실행 / 타입 체크 / 프로덕션 빌드:
   ```bash
   npm run dev
   npm run check
   npm run build
   ```

4. 프로덕션 실행:
   ```bash
   npm run start
   ```
