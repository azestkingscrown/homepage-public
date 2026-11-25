export type Locale = "ko" | "en";

export const LOCALE_COOKIE = "azest_lang";

function parseAcceptLanguage(header: string): { lang: string; q: number }[] {
  return header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const lang = rawTag.trim().toLowerCase();
      let q = 1;
      for (const p of params) {
        const trimmed = p.trim().toLowerCase();
        if (trimmed.startsWith("q=")) {
          const parsed = Number.parseFloat(trimmed.slice(2));
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { lang, q };
    })
    .filter((entry) => entry.lang.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);
}

export function detectLocale(
  cookieLocale?: string | null,
  acceptLanguage?: string | null,
  userAgent?: string | null,
): Locale {
  if (cookieLocale === "ko" || cookieLocale === "en") {
    return cookieLocale;
  }

  if (acceptLanguage?.trim()) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    const top = parsed[0]?.lang || "";
    if (top === "ko" || top.startsWith("ko-")) {
      return "ko";
    }
    if (top && top !== "*") {
      return "en";
    }
  }

  if (userAgent && /\bko(?:-[a-z]{2})?\b/i.test(userAgent)) {
    return "ko";
  }

  return "en";
}

export const translations = {
  ko: {
    site: {
      description: "아제스트의 개인 워크스페이스 및 서버 인프라 대시보드",
      switchLangLabel: "언어 전환 (한국어 / English)",
      toggleThemeLabel: "테마 전환",
      currentThemePrefix: "현재 테마",
      openSidebar: "사이드바 열기",
      closeMenu: "메뉴 닫기",
      close: "닫기",
      mobileNav: "모바일 내비게이션",
      mainSidebar: "주 사이드바",
      backdropClose: "배경 클릭 시 닫기",
    },
    nav: {
      overview: "Overview",
      chzzkGuide: "치지직 봇 가이드",
      chzzkUpdate: "업데이트 내역",
      technicalInfo: "기술 문서",
      ddns: "DDNS 관리",
      minecraft: "Minecraft 제어",
      hosting: "File Hosting",
      admin: "Admin 대시보드",
      github: "GitHub",
      contactServer: "익명 문의 서버",
      boySite: "혀엉..",
      discordAuthed: "Discord 인증됨",
      loginOrTheme: "로그인 / 테마 설정",
      loggedOut: "비로그인 상태",
      themeSettings: "테마 설정",
      languageSettings: "언어 설정",
      themeLight: "라이트 모드",
      themeDark: "다크 모드",
      themeSystem: "시스템 연동",
      discordSignOut: "Discord 로그아웃",
      discordSignIn: "Discord로 로그인",
    },
    footer: {
      supportKr: "후원 (국내 · 카카오페이)",
      supportGlobal: "Support (Global · Ko-fi)",
    },
    discord: {
      online: "온라인",
      idle: "수면 중",
      dnd: "다른 용무 중",
      offline: "오프라인",
    },
    home: {
      subtitle: "개인 워크스페이스, 인프라 모니터링 및 서비스 대시보드",
      badge: "Full-stack Developer & Server Admin",
      greeting: "안녕하세요. 아제스트 입니다.",
      bio: "다양한 언어를 이용한 각종 개발과 서버 인프라 운영을 취미로 즐깁니다. 거창한 목표보다는 내가 필요해서 만든 도구들이 누군가에게도 도움이 되기를 바랍니다.",
      btnGuide: "치지직 봇 가이드",
      btnUpdate: "업데이트 내역",
      btnBoy: "혀엉..",
      minecraftPanel: "Minecraft 제어 패널 →",
      contactTitle: "완전 익명 문의 시스템",
      contactDesc:
        "프라이버시 보호를 위해 1:1 익명 티켓 시스템을 운영하고 있습니다. 상담이 시작되면 닉네임이 익명으로 처리되며, 종료 시 상담 내역은 안전하게 보관 후 자동 퇴장 처리됩니다.",
      contactBtn: "문의 서버 입장하기",
    },
    update: {
      pageTitle: "치지직 디스코드 봇 업데이트 내역 | Azest_Kingscrown",
      heading: "치지직 디스코드 봇 업데이트 내역",
      subheading: "아키텍처 개편, 인프라 확장 및 커스텀 알림 기능 패치 노트",
      btnFullGuide: "전체 가이드",
      r1Title: "20샤드 내부 샤딩 & Dynamic Failover 아키텍처 개편",
      r1IntroPre: "디스코드 봇의 전면적인 가용성 확보와 인프라 효율 향상을 위해 ",
      r1IntroStrong:
        "고정 20샤드 내부 샤딩(Internal Sharding) 및 동적 페일오버(Dynamic Failover) 구조",
      r1IntroPost: "로 전면 개편되었습니다.",
      r1b1Title: "무정지 고정 20샤드 가동:",
      r1b1Desc:
        "20개 샤드(0~19번)를 영구 고정 운영하여 최대 20,000~50,000대 서버까지 확장 대응이 가능합니다.",
      r1b2Title: "초절전형 단일 프로세스 내부 샤딩:",
      r1b2Pre: "GCP 955MB 저사양에서도 단 ",
      r1b2Highlight: "80MB",
      r1b2Post: "대 메모리로 20개 샤드 전체를 OOM 없이 구동합니다.",
      r1b3Title: "게이트웨이 플래핑 원천 방어:",
      r1b3Pre: "슬레이브 노드는 30MB대 대기 모드로 상주하다 마스터 장애 시에만 ",
      r1b3Post: "을 동적 트리거합니다.",
      r1b4Title: "SQLite WAL 모드 도입:",
      r1b4Pre: "다중 샤드 동시 쓰기에도 파일 락 충돌(",
      r1b4Post: ")이 없도록 비동기 큐잉 및 busy_timeout을 적용했습니다.",
      r1b5Title: "한디리(Koreanbots) API 연동 최적화:",
      r1b5Desc:
        "마스터 봇 내부에서 직접 실시간 가입 서버 통계와 샤드 수를 갱신하여 세션 충돌을 차단했습니다.",
      r2Title: "글로벌 네트워크 인프라 대규모 확충",
      r2b1Title: "5-Node 분산 아키텍처:",
      r2b1Desc:
        "한국 GCP 2개, 해외 Oracle 2개, Cloudflare 1개 총 5개의 독립 분산 프록시 노드로 작동합니다.",
      r2b2Title: "압도적인 IP 풀 활용:",
      r2b2Desc:
        "GCP 서울 리전 약 19만 개(193,536개), Cloudflare 약 152만 개(1,524,736개) IPv4 주소를 순환 활용하여 쓰로틀링을 방어합니다.",
      r2b3Title: "국내 전용 방송 완벽 지원:",
      r2b3Desc:
        "서울 리전 프록시 도입으로 지역 제한 에러 없이 국내 전용 방송도 신속 감지합니다.",
      fTitle: "주요 업데이트 내용: 커스텀 알림 & 선택 등록",
      fIntroPre: "새로운 명령어 ",
      fIntroPost:
        "으로 스트리머별·알림 종류별(방송시작/커뮤니티) 멘션 대상과 알림 메시지를 자유롭게 커스터마이징할 수 있습니다.",
      fb1Title: "독립적인 설정:",
      fb1Desc: "스트리머마다 서로 다른 멘션 역할 및 문구 지정 가능",
      fb2Title: "완벽한 하위 호환성:",
      fb2Pre: "기존 등록 스트리머는 기본값(",
      fb2Post: ") 자동 유지",
      fb3Title: "알림 종류 선택 등록:",
      fb3Post: " 시 모두 / 커뮤니티만 / 방송시작만 선택 가능",
      exTitle: "활용 예시",
      ex1Title: "예시 1: 특정 역할에게만 멘션 보내기",
      ex2Title: "예시 2: 조용하게 알림만 보내기 (멘션 끄기)",
      ex3Title: "예시 3: 스트리머 이름 자동 치환 ({streamer})",
      btnBackMain: "메인으로 돌아가기",
      btnViewGuide: "치지직 봇 전체 가이드 보기",
    },
    minecraft: {
      pageTitle: "마인크래프트 서버 대시보드 | Azest_Kingscrown",
      heading: "마인크래프트 서버 대시보드",
      subheading: "화이트리스트 인증 사용자의 원격 서버 시작/종료 제어 및 리소스 모니터링",
      btnAdminLogs: "관리자 로그 확인",
      checking: "확인 중...",
      onlineHealthy: "온라인 (정상)",
      startingLoading: "실행 중 (로딩 중...)",
      offlineStopped: "오프라인 (꺼짐)",
      statusError: "오류 발생",
      containerStatus: "컨테이너 상태:",
      authRequiredTitle: "서버 제어 인증 필요",
      authRequiredDesc:
        "화이트리스트에 등록된 Discord 계정으로 로그인하면 서버 시작/종료 버튼을 사용할 수 있습니다.",
      loginWithDiscord: "Discord로 로그인",
      verifiedBadge: "인증됨",
      welcomeSuffix: " 님 환영합니다",
      signOut: "로그아웃",
      btnStart: "서버 켜기",
      btnStop: "서버 끄기",
      startingMsg: "서버가 켜지는 중입니다. 잠시만 기다려주세요...",
      stoppingMsg: "서버를 종료하는 중입니다...",
      startedAlert: "마인크래프트 서버가 완전히 켜졌습니다!",
      unauthorizedAlert: "세션이 만료되었거나 접근 권한이 없습니다.",
      errorAlert: "오류가 발생했습니다.",
      networkErrorAlert: "통신 오류가 발생했습니다.",
      systemResources: "시스템 리소스 상태",
    },
    unauthorized: {
      pageTitle: "접근 권한 없음 | Azest_Kingscrown",
      heading: "접근 권한이 없습니다",
      description:
        "죄송합니다. 등록된 디스코드 화이트리스트 계정만 이 대시보드를 제어할 수 있습니다. 관리자에게 화이트리스트 등록을 요청하시거나 다른 계정으로 로그인해 주세요.",
      btnBackControl: "제어 페이지로 돌아가기",
      btnBackHome: "메인 페이지로 이동",
    },
  },
  en: {
    site: {
      description: "Azest's Personal Workspace, Infrastructure Monitoring & Service Dashboard",
      switchLangLabel: "Switch language (Korean / English)",
      toggleThemeLabel: "Toggle theme",
      currentThemePrefix: "Current theme",
      openSidebar: "Open sidebar",
      closeMenu: "Close menu",
      close: "Close",
      mobileNav: "Mobile navigation",
      mainSidebar: "Primary sidebar",
      backdropClose: "Click backdrop to close",
    },
    nav: {
      overview: "Overview",
      chzzkGuide: "Chzzk Bot Guide",
      chzzkUpdate: "Changelog",
      technicalInfo: "Technical Docs",
      ddns: "DDNS Manager",
      minecraft: "Minecraft Control",
      hosting: "File Hosting",
      admin: "Admin Dashboard",
      github: "GitHub",
      contactServer: "Anonymous Support",
      boySite: "Hyeong..",
      discordAuthed: "Discord Verified",
      loginOrTheme: "Sign in / Preferences",
      loggedOut: "Signed out",
      themeSettings: "Appearance",
      languageSettings: "Language",
      themeLight: "Light Mode",
      themeDark: "Dark Mode",
      themeSystem: "System Default",
      discordSignOut: "Sign out of Discord",
      discordSignIn: "Sign in with Discord",
    },
    footer: {
      supportKr: "Support (Korea · KakaoPay)",
      supportGlobal: "Support (Global · Ko-fi)",
    },
    discord: {
      online: "Online",
      idle: "Idle / Away",
      dnd: "Do Not Disturb",
      offline: "Offline",
    },
    home: {
      subtitle: "Personal Workspace, Infrastructure Monitoring & Services",
      badge: "Full-stack Developer & Server Admin",
      greeting: "Hello, I'm Azest.",
      bio: "I enjoy building tools across multiple languages and operating self-hosted server infrastructure. Rather than chasing grand goals, I hope the utilities I build for myself prove helpful to others too.",
      btnGuide: "Chzzk Bot Guide",
      btnUpdate: "Changelog",
      btnBoy: "Hyeong..",
      minecraftPanel: "Minecraft Control Panel →",
      contactTitle: "Fully Anonymous Ticket System",
      contactDesc:
        "For your privacy, we operate a 1:1 anonymous ticket system on Discord. Your nickname is anonymized once a session starts, and upon closing, transcripts are archived securely before automatic exit.",
      contactBtn: "Join Support Server",
    },
    update: {
      pageTitle: "Chzzk Discord Bot Changelog | Azest_Kingscrown",
      heading: "Chzzk Discord Bot Changelog",
      subheading: "Architecture overhaul, global proxy expansion & custom notification patch notes",
      btnFullGuide: "Full Guide",
      r1Title: "20-Shard Internal Sharding & Dynamic Failover Overhaul",
      r1IntroPre: "To maximize availability and infrastructure efficiency, the Discord bot has been completely rebuilt with ",
      r1IntroStrong: "fixed 20-shard Internal Sharding and a Dynamic Failover architecture",
      r1IntroPost: ".",
      r1b1Title: "Zero-Downtime Fixed 20 Shards:",
      r1b1Desc:
        "Runs 20 permanently fixed shards (0–19), seamlessly scaling up to 20,000–50,000 Discord servers.",
      r1b2Title: "Ultra-Low-Memory Single-Process Sharding:",
      r1b2Pre: "Operates all 20 shards smoothly within ",
      r1b2Highlight: "~80MB",
      r1b2Post: " RAM even on 955MB low-spec GCP instances without OOM.",
      r1b3Title: "Gateway Flapping Protection:",
      r1b3Pre: "The standby slave node idles at ~30MB RAM and dynamically triggers ",
      r1b3Post: " only when a master failure is detected.",
      r1b4Title: "SQLite WAL Mode:",
      r1b4Pre: "Added asynchronous queueing and busy_timeout to eliminate file-lock contention (",
      r1b4Post: ") under concurrent multi-shard writes.",
      r1b5Title: "Koreanbots API Optimization:",
      r1b5Desc:
        "Updates live guild and shard statistics directly inside the master bot process to avoid session collisions.",
      r2Title: "Global Network Infrastructure Expansion",
      r2b1Title: "5-Node Distributed Proxy Architecture:",
      r2b1Desc:
        "Operates across 5 independent proxy nodes: 2 GCP Korea nodes, 2 Oracle global nodes, and 1 Cloudflare edge worker.",
      r2b2Title: "Massive IP Pool Rotation:",
      r2b2Desc:
        "Rotates across ~193k GCP Seoul IPv4 addresses and ~1.52M Cloudflare edge IPv4 addresses to prevent throttling.",
      r2b3Title: "Korea-Only Stream Support:",
      r2b3Desc:
        "Seoul region proxies detect Korea-restricted broadcasts immediately without geo-block errors.",
      fTitle: "Feature Update: Custom Alerts & Selective Subscriptions",
      fIntroPre: "With the new ",
      fIntroPost:
        " command, you can customize mention targets and alert messages per streamer and per event type (Live / Community).",
      fb1Title: "Per-Streamer Configuration:",
      fb1Desc: "Assign distinct mention roles and custom messages for each streamer.",
      fb2Title: "Full Backward Compatibility:",
      fb2Pre: "Existing subscriptions automatically preserve the default (",
      fb2Post: ") behavior.",
      fb3Title: "Selective Alert Types:",
      fb3Post: " supports All / Community Only / Live Only registration.",
      exTitle: "Usage Examples",
      ex1Title: "Example 1: Mention a specific role only",
      ex2Title: "Example 2: Silent alert without mentions",
      ex3Title: "Example 3: Automatic streamer name substitution ({streamer})",
      btnBackMain: "Back to Overview",
      btnViewGuide: "View Full Chzzk Bot Guide",
    },
    minecraft: {
      pageTitle: "Minecraft Server Dashboard | Azest_Kingscrown",
      heading: "Minecraft Server Dashboard",
      subheading: "Remote start/stop control and live resource monitoring for whitelisted users",
      btnAdminLogs: "View Admin Logs",
      checking: "Checking...",
      onlineHealthy: "Online (Healthy)",
      startingLoading: "Running (Starting...)",
      offlineStopped: "Offline (Stopped)",
      statusError: "Error",
      containerStatus: "Container status:",
      authRequiredTitle: "Authentication Required",
      authRequiredDesc:
        "Sign in with a whitelisted Discord account to start or stop the Minecraft server.",
      loginWithDiscord: "Sign in with Discord",
      verifiedBadge: "Verified",
      welcomeSuffix: ", welcome back",
      signOut: "Sign out",
      btnStart: "Start Server",
      btnStop: "Stop Server",
      startingMsg: "Starting the server. Please wait...",
      stoppingMsg: "Stopping the server...",
      startedAlert: "The Minecraft server is now fully online!",
      unauthorizedAlert: "Your session has expired or you do not have permission.",
      errorAlert: "An error occurred.",
      networkErrorAlert: "A network error occurred.",
      systemResources: "System Resources",
    },
    unauthorized: {
      pageTitle: "Access Denied | Azest_Kingscrown",
      heading: "Access Denied",
      description:
        "Sorry, only whitelisted Discord accounts can access this control panel. Please ask the administrator to add your account or sign in with another account.",
      btnBackControl: "Back to Control Panel",
      btnBackHome: "Go to Overview",
    },
  },
} as const;

export type Translations = (typeof translations)[Locale];

export function getTranslations(locale: Locale): Translations {
  return translations[locale] || translations.en;
}
