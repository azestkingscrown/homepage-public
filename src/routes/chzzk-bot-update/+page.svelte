<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import { buildHostUrls } from "#lib/siteLinks.ts";

  let { data } = $props();
  let urls = $derived(buildHostUrls(data.host));
</script>

<svelte:head>
  <title>치지직 디스코드 봇 업데이트 내역 | Azest_Kingscrown</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <!-- Header -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
          Changelog
        </span>
        <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400">
          Discord Verified App
        </span>
      </div>
      <h1 class="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        치지직 디스코드 봇 업데이트 내역
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        아키텍처 개편, 인프라 확장 및 커스텀 알림 기능 패치 노트
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <a
        href={`${urls.chzzkUrl}/guide`}
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
      >
        <Icon name="book" class="size-4" />
        전체 가이드
      </a>
    </div>
  </div>

  <!-- Release 1 -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="cpu" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          20샤드 내부 샤딩 &amp; Dynamic Failover 아키텍처 개편
        </h2>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400">NEW</span>
        <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">2026.06.29</span>
      </div>
    </div>

    <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      디스코드 봇의 전면적인 가용성 확보와 인프라 효율 향상을 위해
      <strong class="font-semibold text-gray-900 dark:text-gray-50">
        고정 20샤드 내부 샤딩(Internal Sharding) 및 동적 페일오버(Dynamic Failover) 구조
      </strong>로 전면 개편되었습니다.
    </p>

    <ul class="space-y-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">무정지 고정 20샤드 가동:</strong> 20개 샤드(0~19번)를 영구 고정 운영하여 최대 20,000~50,000대 서버까지 확장 대응이 가능합니다.</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">초절전형 단일 프로세스 내부 샤딩:</strong> GCP 955MB 저사양에서도 단 <strong class="text-indigo-600 dark:text-indigo-400">80MB</strong>대 메모리로 20개 샤드 전체를 OOM 없이 구동합니다.</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">게이트웨이 플래핑 원천 방어:</strong> 슬레이브 노드는 30MB대 대기 모드로 상주하다 마스터 장애 시에만 <code class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-900">client.login()</code>을 동적 트리거합니다.</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">SQLite WAL 모드 도입:</strong> 다중 샤드 동시 쓰기에도 파일 락 충돌(<code class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-900">SQLITE_BUSY</code>)이 없도록 비동기 큐잉 및 busy_timeout을 적용했습니다.</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">한디리(Koreanbots) API 연동 최적화:</strong> 마스터 봇 내부에서 직접 실시간 가입 서버 통계와 샤드 수를 갱신하여 세션 충돌을 차단했습니다.</span>
      </li>
    </ul>
  </section>

  <!-- Release 2 -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="globe" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          글로벌 네트워크 인프라 대규모 확충
        </h2>
      </div>
      <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">2026.05.31</span>
    </div>

    <ul class="space-y-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">5-Node 분산 아키텍처:</strong> 한국 GCP 2개, 해외 Oracle 2개, Cloudflare 1개 총 5개의 독립 분산 프록시 노드로 작동합니다.</span></li>
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">압도적인 IP 풀 활용:</strong> GCP 서울 리전 약 19만 개(193,536개), Cloudflare 약 152만 개(1,524,736개) IPv4 주소를 순환 활용하여 쓰로틀링을 방어합니다.</span></li>
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">국내 전용 방송 완벽 지원:</strong> 서울 리전 프록시 도입으로 지역 제한 에러 없이 국내 전용 방송도 신속 감지합니다.</span></li>
    </ul>
  </section>

  <!-- Feature Update -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="sparkles" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          주요 업데이트 내용: 커스텀 알림 &amp; 선택 등록
        </h2>
      </div>
      <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400">Feature</span>
    </div>

    <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      새로운 명령어 <code class="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">/알림메시지설정</code>으로
      스트리머별·알림 종류별(방송시작/커뮤니티) 멘션 대상과 알림 메시지를 자유롭게 커스터마이징할 수 있습니다.
    </p>
    <ul class="space-y-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li>• <strong class="text-gray-900 dark:text-gray-100">독립적인 설정:</strong> 스트리머마다 서로 다른 멘션 역할 및 문구 지정 가능</li>
      <li>• <strong class="text-gray-900 dark:text-gray-100">완벽한 하위 호환성:</strong> 기존 등록 스트리머는 기본값(<code>@everyone</code>) 자동 유지</li>
      <li>• <strong class="text-gray-900 dark:text-gray-100">알림 종류 선택 등록:</strong> <code>/등록</code> 시 모두 / 커뮤니티만 / 방송시작만 선택 가능</li>
    </ul>
  </section>

  <!-- Examples -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="terminal" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">활용 예시</h2>
      </div>
    </div>

    <div class="space-y-3">
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">예시 1: 특정 역할에게만 멘션 보내기</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:방송시작 멘션역할:@소연팬 메시지:강소연 방송 켰다! 다들 모여라!</pre>
      </div>
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">예시 2: 조용하게 알림만 보내기 (멘션 끄기)</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:커뮤니티 멘션역할:(아예 비워둠) 메시지:(원하는 문구 기입 또는 비워둠)</pre>
      </div>
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">예시 3: 스트리머 이름 자동 치환 ({"{streamer}"})</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:방송시작 멘션역할:@everyone 메시지: 드디어 {"{streamer}"}님이 방송을 켰습니다!</pre>
      </div>
    </div>
  </section>

  <!-- Bottom Links -->
  <div class="flex flex-wrap items-center gap-3 pt-2">
    <a
      href={`${urls.mainUrl}/`}
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
    >
      <Icon name="arrowLeft" class="size-4" />
      메인으로 돌아가기
    </a>
    <a
      href={`${urls.chzzkUrl}/guide`}
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
    >
      치지직 봇 전체 가이드 보기
    </a>
  </div>
</div>
