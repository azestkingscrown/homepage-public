const DEFAULT_GITHUB_USERNAME = "your-github-username";
const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface GitHubStatsData {
  username: string;
  displayName: string;
  totalStars: number;
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  contributedTo: number;
  rank: {
    level: string;
    percentile: number;
  };
  fetchedAt: number;
}

interface CacheEntry {
  data: GitHubStatsData;
  updatedAt: number;
}

const statsCache = new Map<string, CacheEntry>();

function exponentialCdf(x: number): number {
  return 1 - Math.pow(2, -x);
}

function logNormalCdf(x: number): number {
  return x / (1 + x);
}

/**
 * Compute GitHub profile rank and percentile using standard weighted CDF formula.
 */
function calculateRank(stats: {
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  stars: number;
  followers: number;
}): { level: string; percentile: number } {
  const COMMITS_MEDIAN = 250;
  const COMMITS_WEIGHT = 2;
  const PRS_MEDIAN = 50;
  const PRS_WEIGHT = 3;
  const ISSUES_MEDIAN = 25;
  const ISSUES_WEIGHT = 1;
  const REVIEWS_MEDIAN = 2;
  const REVIEWS_WEIGHT = 1;
  const STARS_MEDIAN = 50;
  const STARS_WEIGHT = 4;
  const FOLLOWERS_MEDIAN = 10;
  const FOLLOWERS_WEIGHT = 1;

  const TOTAL_WEIGHT =
    COMMITS_WEIGHT +
    PRS_WEIGHT +
    ISSUES_WEIGHT +
    REVIEWS_WEIGHT +
    STARS_WEIGHT +
    FOLLOWERS_WEIGHT;

  const rankValue =
    1 -
    (COMMITS_WEIGHT * exponentialCdf(stats.commits / COMMITS_MEDIAN) +
      PRS_WEIGHT * exponentialCdf(stats.prs / PRS_MEDIAN) +
      ISSUES_WEIGHT * exponentialCdf(stats.issues / ISSUES_MEDIAN) +
      REVIEWS_WEIGHT * exponentialCdf(stats.reviews / REVIEWS_MEDIAN) +
      STARS_WEIGHT * logNormalCdf(stats.stars / STARS_MEDIAN) +
      FOLLOWERS_WEIGHT * logNormalCdf(stats.followers / FOLLOWERS_MEDIAN)) /
      TOTAL_WEIGHT;

  const percentile = Math.min(100, Math.max(0, rankValue * 100));

  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ["S+", "S", "A+", "A", "A-", "B+", "B", "B-", "C+"];
  const idx = thresholds.findIndex((t) => percentile <= t);
  const level = idx === -1 ? "C" : levels[idx];

  return { level, percentile };
}

const GRAPHQL_QUERY = `
query userStats($login: String!, $after: String) {
  user(login: $login) {
    name
    login
    repositories(
      first: 100
      ownerAffiliations: OWNER
      isFork: false
      orderBy: { field: STARGAZERS, direction: DESC }
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        stargazerCount
      }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestReviewContributions
    }
    pullRequests(first: 1) {
      totalCount
    }
    openIssues: issues(states: OPEN) {
      totalCount
    }
    closedIssues: issues(states: CLOSED) {
      totalCount
    }
    repositoriesContributedTo(
      first: 1
      contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]
    ) {
      totalCount
    }
    followers {
      totalCount
    }
  }
}
`;

interface GraphQLUserNode {
  name?: string | null;
  login?: string;
  repositories?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    nodes?: Array<{ stargazerCount?: number } | null>;
  };
  contributionsCollection?: {
    totalCommitContributions?: number;
    restrictedContributionsCount?: number;
    totalPullRequestReviewContributions?: number;
  };
  pullRequests?: { totalCount?: number };
  openIssues?: { totalCount?: number };
  closedIssues?: { totalCount?: number };
  repositoriesContributedTo?: { totalCount?: number };
  followers?: { totalCount?: number };
}

async function fetchGraphQLPage(
  token: string,
  username: string,
  after: string | null,
): Promise<GraphQLUserNode> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "homepage-public/1.0",
    },
    body: JSON.stringify({
      query: GRAPHQL_QUERY,
      variables: { login: username, after },
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { user?: GraphQLUserNode | null };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data?.user) {
    throw new Error(`GitHub user not found: ${username}`);
  }
  return json.data.user;
}

/**
 * Fetch GitHub profile stats for SVG rendering with short-TTL in-memory cache
 * and stale-cache fallback on transient upstream errors.
 */
export async function getGitHubStats(usernameOverride?: string): Promise<GitHubStatsData> {
  const username =
    usernameOverride?.trim() ||
    process.env.GITHUB_USERNAME?.trim() ||
    DEFAULT_GITHUB_USERNAME;
  const cached = statsCache.get(username);
  const now = Date.now();

  if (cached && now - cached.updatedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    if (cached) return cached.data;
    throw new Error("GITHUB_TOKEN is not configured");
  }

  try {
    let totalStars = 0;
    let after: string | null = null;
    let firstPageUser: GraphQLUserNode | null = null;

    for (let page = 0; page < 3; page++) {
      const user = await fetchGraphQLPage(token, username, after);
      if (!firstPageUser) firstPageUser = user;

      const nodes = user.repositories?.nodes ?? [];
      for (const repo of nodes) {
        totalStars += repo?.stargazerCount ?? 0;
      }

      const pageInfo = user.repositories?.pageInfo;
      if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
      after = pageInfo.endCursor;
    }

    const u = firstPageUser!;
    const totalCommits =
      (u.contributionsCollection?.totalCommitContributions ?? 0) +
      (u.contributionsCollection?.restrictedContributionsCount ?? 0);
    const totalPRs = u.pullRequests?.totalCount ?? 0;
    const totalIssues =
      (u.openIssues?.totalCount ?? 0) + (u.closedIssues?.totalCount ?? 0);
    const contributedTo = u.repositoriesContributedTo?.totalCount ?? 0;
    const reviews = u.contributionsCollection?.totalPullRequestReviewContributions ?? 0;
    const followers = u.followers?.totalCount ?? 0;

    const data: GitHubStatsData = {
      username: u.login || username,
      displayName: u.name?.trim() || u.login || username,
      totalStars,
      totalCommits,
      totalPRs,
      totalIssues,
      contributedTo,
      rank: calculateRank({
        commits: totalCommits,
        prs: totalPRs,
        issues: totalIssues,
        reviews,
        stars: totalStars,
        followers,
      }),
      fetchedAt: now,
    };

    statsCache.set(username, { data, updatedAt: now });
    return data;
  } catch (err) {
    console.error("Failed to fetch GitHub stats:", err);
    if (cached) return cached.data;
    throw err;
  }
}
