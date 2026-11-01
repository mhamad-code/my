/**
 * GitHub REST client for the local-first app.
 *
 * Everything here talks straight to `https://api.github.com` from the browser:
 * a personal access token needs no client secret, and GitHub serves CORS
 * headers on every documented endpoint. The token never leaves the device —
 * it is stored in IndexedDB, sent only to api.github.com, and never written to
 * the URL, the console or a log.
 */

const API_ROOT = "https://api.github.com"
const API_VERSION = "2022-11-28"

export type GitHubErrorKind =
  | "unauthorized"
  | "forbidden"
  | "rate-limit"
  | "not-found"
  | "validation"
  | "network"
  | "unknown"

/** A failed GitHub call, with the reason already turned into advice. */
export class GitHubApiError extends Error {
  readonly kind: GitHubErrorKind
  readonly status: number
  readonly hint: string
  /** Epoch milliseconds, when GitHub told us when the limit resets. */
  readonly resetAt?: number

  constructor(kind: GitHubErrorKind, status: number, message: string, hint: string, resetAt?: number) {
    super(message)
    this.name = "GitHubApiError"
    this.kind = kind
    this.status = status
    this.hint = hint
    this.resetAt = resetAt
  }

  /** One line for the transcript: what failed and what to do about it. */
  get explanation(): string {
    return `${this.message} ${this.hint}`.trim()
  }
}

export type GitHubTokenType = "fine-grained" | "classic" | "unknown"

export type GitHubProfile = {
  login: string
  id: number
  name: string | null
  avatarUrl: string
  htmlUrl: string
  type: string
  company: string | null
  bio: string | null
  publicRepos: number
}

export type GitHubVerification = {
  profile: GitHubProfile
  tokenType: GitHubTokenType
  /** Scopes GitHub reported for a classic token; empty for fine-grained ones. */
  scopes: string[]
  /** ISO timestamp from `github-authentication-token-expiration`, when present. */
  expiresAt: string | null
  /** Remaining REST requests in the current window. */
  rateLimitRemaining: number | null
  rateLimitReset: number | null
}

export type GitHubRepo = {
  id: number
  name: string
  fullName: string
  owner: string
  description: string | null
  private: boolean
  fork: boolean
  language: string | null
  defaultBranch: string
  updatedAt: string
  htmlUrl: string
  stars: number
  openIssues: number
  archived: boolean
}

export type GitHubBranch = {
  name: string
  protected: boolean
  sha: string
}

export type GitHubCommit = {
  sha: string
  message: string
  author: string | null
  date: string | null
  htmlUrl: string
}

export type GitHubFile = {
  path: string
  name: string
  sha: string
  size: number
  type: string
  htmlUrl: string | null
  downloadUrl: string | null
  /** Decoded UTF-8 text, only for regular files under the size limit. */
  content?: string
  truncated?: boolean
}

export type GitHubIssue = {
  number: number
  title: string
  state: string
  user: string | null
  labels: string[]
  comments: number
  createdAt: string
  updatedAt: string
  htmlUrl: string
  pullRequest: boolean
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

type RawResponse<T> = { data: T; headers: Headers }

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? `${API_ROOT}${path}` : `${API_ROOT}/${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function rateLimitFrom(headers: Headers): { remaining: number | null; reset: number | null } {
  const remaining = headers.get("x-ratelimit-remaining")
  const reset = headers.get("x-ratelimit-reset")
  return {
    remaining: remaining === null ? null : Number(remaining),
    reset: reset === null ? null : Number(reset) * 1000,
  }
}

/**
 * Maps a status to the one message that actually helps. The 403 branch matters
 * most: GitHub uses it for both "your token cannot do this" and "you are out of
 * requests", and they need different fixes.
 */
function describeFailure(status: number, headers: Headers, payload: unknown): GitHubApiError {
  const body = payload as { message?: string; errors?: { message?: string }[] } | null
  const apiMessage = body?.message?.trim()
  const { remaining, reset } = rateLimitFrom(headers)
  const retryHint =
    remaining === 0 && reset
      ? `Rate limit reached; it resets at ${new Date(reset).toLocaleTimeString()}.`
      : "Rate limit reached; wait for the window to reset."

  if (status === 401) {
    return new GitHubApiError(
      "unauthorized",
      401,
      "GitHub rejected the token (401).",
      "It is invalid, revoked or expired — create a new fine-grained token and reconnect."
    )
  }
  if (status === 403) {
    if (remaining === 0) {
      return new GitHubApiError("rate-limit", 403, "GitHub rate limit reached (403).", retryHint, reset ?? undefined)
    }
    return new GitHubApiError(
      "forbidden",
      403,
      "This token is not allowed to do that (403).",
      "Fine-grained tokens need the repository selected plus Metadata: Read. Classic tokens need the matching scope (repo, read:org)."
    )
  }
  if (status === 404) {
    return new GitHubApiError(
      "not-found",
      404,
      "GitHub could not find that resource (404).",
      "Either the name is wrong or the token has no access to it — private repositories are invisible without permission."
    )
  }
  if (status === 422) {
    const detail = body?.errors?.[0]?.message ?? apiMessage ?? "The request data was rejected."
    return new GitHubApiError("validation", 422, `GitHub rejected the request (422): ${detail}`, "Check the values and try again.")
  }
  if (status === 429) {
    return new GitHubApiError("rate-limit", 429, "GitHub is throttling requests (429).", retryHint, reset ?? undefined)
  }
  return new GitHubApiError(
    "unknown",
    status,
    apiMessage ? `GitHub returned ${status}: ${apiMessage}` : `GitHub returned ${status}.`,
    status >= 500 ? "That is a GitHub-side failure; retry in a moment." : ""
  )
}

async function request<T>(token: string, path: string, options: RequestOptions = {}): Promise<RawResponse<T>> {
  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new GitHubApiError(
      "network",
      0,
      "Could not reach api.github.com.",
      "Check the connection, a VPN or an extension blocking the request, then retry."
    )
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { message: text.slice(0, 200) }
    }
  }

  if (!response.ok) throw describeFailure(response.status, response.headers, payload)
  return { data: payload as T, headers: response.headers }
}

function tokenTypeOf(headers: Headers): GitHubTokenType {
  if (headers.get("x-accepted-github-permissions")) return "fine-grained"
  const scopes = headers.get("x-oauth-scopes")
  if (scopes !== null) return "classic"
  return "unknown"
}

function scopesOf(headers: Headers): string[] {
  const raw = headers.get("x-oauth-scopes") ?? ""
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ account */

type RawUser = {
  login: string
  id: number
  name: string | null
  avatar_url: string
  html_url: string
  type: string
  company: string | null
  bio: string | null
  public_repos: number
}

function toProfile(user: RawUser): GitHubProfile {
  return {
    login: user.login,
    id: user.id,
    name: user.name,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    type: user.type,
    company: user.company,
    bio: user.bio,
    publicRepos: user.public_repos,
  }
}

/** `GET /user` — the only call that proves a token is alive. */
export async function verifyToken(token: string): Promise<GitHubVerification> {
  const { data, headers } = await request<RawUser>(token, "/user")
  const { remaining, reset } = rateLimitFrom(headers)
  return {
    profile: toProfile(data),
    tokenType: tokenTypeOf(headers),
    scopes: scopesOf(headers),
    expiresAt: headers.get("github-authentication-token-expiration"),
    rateLimitRemaining: remaining,
    rateLimitReset: reset,
  }
}

/* ------------------------------------------------------------- repositories */

type RawRepo = {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  description: string | null
  private: boolean
  fork: boolean
  language: string | null
  default_branch: string
  updated_at: string
  html_url: string
  stargazers_count: number
  open_issues_count: number
  archived: boolean
}

function toRepo(repo: RawRepo): GitHubRepo {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
    private: repo.private,
    fork: repo.fork,
    language: repo.language,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    htmlUrl: repo.html_url,
    stars: repo.stargazers_count,
    openIssues: repo.open_issues_count,
    archived: repo.archived,
  }
}

export type ListReposOptions = {
  page?: number
  perPage?: number
  sort?: "updated" | "pushed" | "full_name" | "created"
  direction?: "asc" | "desc"
  visibility?: "all" | "public" | "private"
  affiliation?: string
}

/** `GET /user/repos` — every repository the token can see, one page at a time. */
export async function listRepositories(
  token: string,
  options: ListReposOptions = {}
): Promise<{ repos: GitHubRepo[]; hasMore: boolean; page: number }> {
  const page = Math.max(1, options.page ?? 1)
  const perPage = Math.min(Math.max(options.perPage ?? 30, 1), 100)
  const { data, headers } = await request<RawRepo[]>(token, "/user/repos", {
    query: {
      page,
      per_page: perPage,
      sort: options.sort ?? "updated",
      direction: options.direction ?? "desc",
      visibility: options.visibility ?? "all",
      affiliation: options.affiliation,
    },
  })
  const link = headers.get("link") ?? ""
  return {
    repos: (data ?? []).map(toRepo),
    hasMore: /rel="next"/.test(link) || (data ?? []).length === perPage,
    page,
  }
}

export async function getRepository(token: string, owner: string, repo: string): Promise<GitHubRepo> {
  const { data } = await request<RawRepo>(token, `/repos/${owner}/${repo}`)
  return toRepo(data)
}

export async function listBranches(
  token: string,
  owner: string,
  repo: string,
  perPage = 30
): Promise<GitHubBranch[]> {
  const { data } = await request<{ name: string; protected: boolean; commit: { sha: string } }[]>(
    token,
    `/repos/${owner}/${repo}/branches`,
    { query: { per_page: Math.min(Math.max(perPage, 1), 100) } }
  )
  return (data ?? []).map((branch) => ({
    name: branch.name,
    protected: branch.protected,
    sha: branch.commit?.sha ?? "",
  }))
}

export async function listCommits(
  token: string,
  owner: string,
  repo: string,
  options: { sha?: string; path?: string; perPage?: number } = {}
): Promise<GitHubCommit[]> {
  const { data } = await request<
    { sha: string; commit: { message: string; author: { name: string; date: string } | null }; html_url: string }[]
  >(token, `/repos/${owner}/${repo}/commits`, {
    query: {
      per_page: Math.min(Math.max(options.perPage ?? 20, 1), 100),
      sha: options.sha,
      path: options.path,
    },
  })
  return (data ?? []).map((commit) => ({
    sha: commit.sha,
    message: commit.commit?.message ?? "",
    author: commit.commit?.author?.name ?? null,
    date: commit.commit?.author?.date ?? null,
    htmlUrl: commit.html_url,
  }))
}

/** Decodes GitHub's base64 payload (which contains newlines) into UTF-8 text. */
export function decodeBase64Content(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

/** `GET /repos/{owner}/{repo}/contents/{path}` — a file, or a directory listing. */
export async function getFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ kind: "file"; file: GitHubFile } | { kind: "dir"; entries: GitHubFile[] }> {
  const clean = path.replace(/^\/+/, "")
  const { data } = await request<
    | {
        type: string
        name: string
        path: string
        sha: string
        size: number
        html_url: string | null
        download_url: string | null
        content?: string
        encoding?: string
      }
    | {
        type: string
        name: string
        path: string
        sha: string
        size: number
        html_url: string | null
        download_url: string | null
      }[]
  >(token, `/repos/${owner}/${repo}/contents/${clean}`, { query: { ref } })

  const toEntry = (entry: {
    type: string
    name: string
    path: string
    sha: string
    size: number
    html_url: string | null
    download_url: string | null
    content?: string
    encoding?: string
  }): GitHubFile => {
    const file: GitHubFile = {
      path: entry.path,
      name: entry.name,
      sha: entry.sha,
      size: entry.size,
      type: entry.type,
      htmlUrl: entry.html_url,
      downloadUrl: entry.download_url,
    }
    if (entry.type === "file" && entry.content && entry.encoding === "base64") {
      try {
        file.content = decodeBase64Content(entry.content)
      } catch {
        file.truncated = true
      }
    }
    return file
  }

  if (Array.isArray(data)) return { kind: "dir", entries: data.map(toEntry) }
  return { kind: "file", file: toEntry(data) }
}

export async function searchRepositories(
  token: string,
  query: string,
  perPage = 10
): Promise<{ repos: GitHubRepo[]; total: number }> {
  const { data } = await request<{ total_count: number; items: RawRepo[] }>(token, "/search/repositories", {
    query: { q: query, per_page: Math.min(Math.max(perPage, 1), 50) },
  })
  return { repos: (data.items ?? []).map(toRepo), total: data.total_count ?? 0 }
}

export async function listIssues(
  token: string,
  owner: string,
  repo: string,
  options: { state?: "open" | "closed" | "all"; labels?: string; perPage?: number } = {}
): Promise<GitHubIssue[]> {
  const { data } = await request<
    {
      number: number
      title: string
      state: string
      user: { login: string } | null
      labels: ({ name?: string } | string)[]
      comments: number
      created_at: string
      updated_at: string
      html_url: string
      pull_request?: unknown
    }[]
  >(token, `/repos/${owner}/${repo}/issues`, {
    query: {
      state: options.state ?? "open",
      labels: options.labels,
      per_page: Math.min(Math.max(options.perPage ?? 20, 1), 100),
    },
  })
  return (data ?? []).map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    user: issue.user?.login ?? null,
    labels: (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name ?? "")).filter(Boolean),
    comments: issue.comments,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    htmlUrl: issue.html_url,
    pullRequest: Boolean(issue.pull_request),
  }))
}

/**
 * `POST /repos/{owner}/{repo}/issues` — a write, so callers must gate it behind
 * an explicit confirmation before reaching this function.
 */
export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  input: { title: string; body?: string; labels?: string[] }
): Promise<GitHubIssue> {
  const { data } = await request<{
    number: number
    title: string
    state: string
    user: { login: string } | null
    labels: ({ name?: string } | string)[]
    comments: number
    created_at: string
    updated_at: string
    html_url: string
  }>(token, `/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: { title: input.title, body: input.body, labels: input.labels },
  })
  return {
    number: data.number,
    title: data.title,
    state: data.state,
    user: data.user?.login ?? null,
    labels: (data.labels ?? []).map((label) => (typeof label === "string" ? label : label.name ?? "")).filter(Boolean),
    comments: data.comments,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    htmlUrl: data.html_url,
    pullRequest: false,
  }
}

/** `owner/repo` from whatever the model passed: a name, a slug or a URL. */
export function splitRepoRef(value: string): { owner: string; repo: string } | null {
  const raw = value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "")
  const parts = raw.split("/").filter(Boolean)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}
