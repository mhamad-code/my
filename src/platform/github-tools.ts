/**
 * GitHub as real agent tools. Every tool below performs an actual REST call,
 * nothing is announced to the model unless a token is connected and the user
 * has the integration in scope for the message.
 *
 * Read tools never need confirmation. `github_create_issue` is a write, so the
 * chat engine stops the turn and waits for an explicit approval before it runs.
 */
import {
  GitHubApiError,
  createIssue,
  getFileContents,
  getRepository,
  listBranches,
  listCommits,
  listIssues,
  listRepositories,
  searchRepositories,
  splitRepoRef,
  verifyToken,
} from "@/platform/github"
import {
  integrationIsInScope,
  type PlatformTool,
  type ToolEnvironment,
  type ToolResult,
} from "@/platform/tools"

const SERVICE_ID = "github"

function tokenOf(environment: ToolEnvironment | undefined): string | undefined {
  return environment?.integrations?.github?.token
}

function connected(environment: ToolEnvironment): boolean {
  return Boolean(tokenOf(environment)) && integrationIsInScope(environment.integrations, SERVICE_ID)
}

function notConnectedReason(environment: ToolEnvironment): string {
  if (!tokenOf(environment)) {
    return "GitHub is not connected. Connect a personal access token in Integrations → GitHub."
  }
  return "GitHub is not attached to this message. Add its chip in the composer to let the agent use it."
}

function failure(error: unknown): ToolResult {
  if (error instanceof GitHubApiError) {
    return { ok: false, content: `GitHub error (${error.status}): ${error.explanation}`, error: error.explanation }
  }
  const message = error instanceof Error ? error.message : "The GitHub request failed."
  return { ok: false, content: `GitHub request failed: ${message}`, error: message }
}

function repoFromArg(value: unknown): { owner: string; repo: string } | null {
  return typeof value === "string" ? splitRepoRef(value) : null
}

/** Markdown table the transcript can render without another dependency. */
function repoTable(
  repos: { fullName: string; description: string | null; private: boolean; language: string | null; defaultBranch: string; updatedAt: string; htmlUrl: string; stars: number }[]
): string {
  const rows = repos.map((repo) => {
    const name = `[${repo.fullName}](${repo.htmlUrl})`
    const visibility = repo.private ? "private" : "public"
    const updated = repo.updatedAt.slice(0, 10)
    const description = (repo.description ?? "—").replace(/\|/g, "\\|").slice(0, 90)
    return `| ${name} | ${visibility} | ${repo.language ?? "—"} | ${repo.defaultBranch} | ${updated} | ${repo.stars} | ${description} |`
  })
  return ["| Repository | Visibility | Language | Default branch | Updated | Stars | Description |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n")
}

const getUserTool: PlatformTool = {
  spec: {
    name: "github_get_authenticated_user",
    description:
      "Read the GitHub account the connected token belongs to: login, display name, profile URL and public repository count. Use it to confirm which account is connected before acting on repositories.",
    parameters: { type: "object", properties: {} },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (_args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    if (!token) return { ok: false, content: "GitHub is not connected." }
    try {
      const verification = await verifyToken(token)
      const { profile } = verification
      return {
        ok: true,
        content: `Connected GitHub account: ${profile.login}${profile.name ? ` (${profile.name})` : ""} · ${profile.type} · ${profile.publicRepos} public repositories · ${profile.htmlUrl}`,
        display: `**GitHub account:** [${profile.login}](${profile.htmlUrl})${profile.name ? ` — ${profile.name}` : ""} · ${profile.type} · ${profile.publicRepos} public repositories`,
        data: verification,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const listReposTool: PlatformTool = {
  spec: {
    name: "github_list_repositories",
    description:
      "List the GitHub repositories the connected token can access, newest activity first. Supports pagination and filters. Returns names, visibility, language, default branch, last update and links.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number, starting at 1." },
        per_page: { type: "number", description: "Repositories per page (1-50)." },
        sort: { type: "string", enum: ["updated", "pushed", "full_name", "created"] },
        visibility: { type: "string", enum: ["all", "public", "private"] },
        search: { type: "string", description: "Optional text filter applied to name and description." },
      },
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    if (!token) return { ok: false, content: "GitHub is not connected." }
    try {
      const perPage = Math.min(Math.max(Number(args.per_page) || 20, 1), 50)
      const page = Math.max(Number(args.page) || 1, 1)
      const { repos, hasMore } = await listRepositories(token, {
        page,
        perPage,
        sort: (args.sort as "updated" | "pushed" | "full_name" | "created" | undefined) ?? "updated",
        visibility: (args.visibility as "all" | "public" | "private" | undefined) ?? "all",
        affiliation: "owner,collaborator,organization_member",
      })
      const term = typeof args.search === "string" ? args.search.trim().toLowerCase() : ""
      const filtered = term
        ? repos.filter(
            (repo) =>
              repo.fullName.toLowerCase().includes(term) ||
              (repo.description ?? "").toLowerCase().includes(term) ||
              (repo.language ?? "").toLowerCase().includes(term)
          )
        : repos
      if (!filtered.length) {
        return {
          ok: true,
          content: term
            ? `No repositories on page ${page} matched “${term}”.`
            : "The token can see no repositories. A fine-grained token without any repository selected returns an empty list.",
        }
      }
      return {
        ok: true,
        content: `GitHub repositories (page ${page}, ${filtered.length} shown${hasMore ? ", more available" : ""}):\n\n${repoTable(filtered)}`,
        display: `### GitHub repositories\n\n${repoTable(filtered)}`,
        data: filtered,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const getRepoTool: PlatformTool = {
  spec: {
    name: "github_get_repository",
    description: "Read one GitHub repository by `owner/repo`: description, language, visibility, default branch and URL.",
    parameters: {
      type: "object",
      properties: { repo: { type: "string", description: "Repository as owner/repo or a github.com URL." } },
      required: ["repo"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    try {
      const repo = await getRepository(token, target.owner, target.repo)
      return {
        ok: true,
        content: `${repo.fullName} (${repo.private ? "private" : "public"}) — ${repo.description ?? "no description"} · ${repo.language ?? "unknown language"} · default branch ${repo.defaultBranch} · ${repo.stars} stars · ${repo.htmlUrl}`,
        data: repo,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const listBranchesTool: PlatformTool = {
  spec: {
    name: "github_list_branches",
    description: "List the branches of a GitHub repository.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository as owner/repo." },
        per_page: { type: "number" },
      },
      required: ["repo"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    try {
      const branches = await listBranches(token, target.owner, target.repo, Number(args.per_page) || 30)
      if (!branches.length) return { ok: true, content: `No branches were returned for ${target.owner}/${target.repo}.` }
      return {
        ok: true,
        content: `Branches in ${target.owner}/${target.repo}:\n\n${branches.map((branch) => `- ${branch.name}${branch.protected ? " (protected)" : ""} · ${branch.sha.slice(0, 7)}`).join("\n")}`,
        data: branches,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const listCommitsTool: PlatformTool = {
  spec: {
    name: "github_list_commits",
    description: "List recent commits of a GitHub repository, optionally for one branch or one file path.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository as owner/repo." },
        branch: { type: "string", description: "Branch or commit SHA." },
        path: { type: "string", description: "Only commits touching this path." },
        per_page: { type: "number" },
      },
      required: ["repo"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    try {
      const commits = await listCommits(token, target.owner, target.repo, {
        sha: typeof args.branch === "string" ? args.branch : undefined,
        path: typeof args.path === "string" ? args.path : undefined,
        perPage: Number(args.per_page) || 20,
      })
      if (!commits.length) return { ok: true, content: `No commits were returned for ${target.owner}/${target.repo}.` }
      return {
        ok: true,
        content: `Recent commits in ${target.owner}/${target.repo}:\n\n${commits
          .map((commit) => `- ${commit.sha.slice(0, 7)} · ${commit.date?.slice(0, 10) ?? "?"} · ${commit.author ?? "unknown"} — ${commit.message.split("\n")[0]}`)
          .join("\n")}`,
        data: commits,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const getFileTool: PlatformTool = {
  spec: {
    name: "github_get_file_contents",
    description:
      "Read a file or list a directory in a GitHub repository. Returns decoded text for files under the API size limit.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository as owner/repo." },
        path: { type: "string", description: "File or directory path; empty for the repository root." },
        ref: { type: "string", description: "Branch, tag or commit SHA." },
      },
      required: ["repo"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    try {
      const result = await getFileContents(
        token,
        target.owner,
        target.repo,
        typeof args.path === "string" ? args.path : "",
        typeof args.ref === "string" ? args.ref : undefined
      )
      if (result.kind === "dir") {
        return {
          ok: true,
          content: `Directory ${target.owner}/${target.repo}/${args.path ?? ""}:\n\n${result.entries.map((entry) => `- ${entry.type}: ${entry.path}`).join("\n")}`,
          data: result.entries,
        }
      }
      const { file } = result
      const text = file.content ?? ""
      return {
        ok: true,
        content: `File ${file.path} (${file.size} bytes):\n\n${text.slice(0, 12000)}${text.length > 12000 ? "\n\n[truncated]" : ""}`,
        data: file,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const searchReposTool: PlatformTool = {
  spec: {
    name: "github_search_repositories",
    description: "Search public GitHub repositories by keyword, language or user qualifier.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query, GitHub syntax allowed (language:ts, user:octocat)." },
        per_page: { type: "number" },
      },
      required: ["query"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const query = typeof args.query === "string" ? args.query.trim() : ""
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!query) return { ok: false, content: "Missing query." }
    try {
      const { repos, total } = await searchRepositories(token, query, Number(args.per_page) || 10)
      if (!repos.length) return { ok: true, content: `No repositories matched “${query}”.` }
      return {
        ok: true,
        content: `${total} repositories match “${query}”; showing ${repos.length}:\n\n${repoTable(repos)}`,
        display: `### GitHub search\n\n${repoTable(repos)}`,
        data: repos,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const listIssuesTool: PlatformTool = {
  spec: {
    name: "github_list_issues",
    description: "List issues (and pull requests) of a GitHub repository.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository as owner/repo." },
        state: { type: "string", enum: ["open", "closed", "all"] },
        labels: { type: "string", description: "Comma-separated label names." },
        per_page: { type: "number" },
      },
      required: ["repo"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    try {
      const issues = await listIssues(token, target.owner, target.repo, {
        state: (args.state as "open" | "closed" | "all" | undefined) ?? "open",
        labels: typeof args.labels === "string" ? args.labels : undefined,
        perPage: Number(args.per_page) || 20,
      })
      if (!issues.length) return { ok: true, content: `No issues matched in ${target.owner}/${target.repo}.` }
      return {
        ok: true,
        content: `Issues in ${target.owner}/${target.repo}:\n\n${issues
          .map((issue) => `- #${issue.number} ${issue.pullRequest ? "(PR) " : ""}${issue.title} · ${issue.state} · ${issue.user ?? "unknown"} · ${issue.htmlUrl}`)
          .join("\n")}`,
        data: issues,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

const createIssueTool: PlatformTool = {
  spec: {
    name: "github_create_issue",
    description:
      "Open a new issue in a GitHub repository. This writes to the user's account, so it only runs after the user approves it in the chat.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "Repository as owner/repo." },
        title: { type: "string" },
        body: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
      },
      required: ["repo", "title"],
    },
  },
  permissions: ["network", "write"],
  requiresConfirmation: true,
  available: connected,
  unavailableReason: notConnectedReason,
  execute: async (args, { integrations }): Promise<ToolResult> => {
    const token = integrations?.github?.token
    const target = repoFromArg(args.repo)
    const title = typeof args.title === "string" ? args.title.trim() : ""
    if (!token) return { ok: false, content: "GitHub is not connected." }
    if (!target) return { ok: false, content: "Pass the repository as owner/repo." }
    if (!title) return { ok: false, content: "Missing issue title." }
    try {
      const issue = await createIssue(token, target.owner, target.repo, {
        title,
        body: typeof args.body === "string" ? args.body : undefined,
        labels: Array.isArray(args.labels) ? args.labels.map(String) : undefined,
      })
      return {
        ok: true,
        content: `Opened issue #${issue.number} in ${target.owner}/${target.repo}: ${issue.title} — ${issue.htmlUrl}`,
        display: `Opened [#${issue.number} ${issue.title}](${issue.htmlUrl}) in ${target.owner}/${target.repo}.`,
        data: issue,
      }
    } catch (error) {
      return failure(error)
    }
  },
}

export const GITHUB_TOOLS: PlatformTool[] = [
  getUserTool,
  listReposTool,
  getRepoTool,
  listBranchesTool,
  listCommitsTool,
  getFileTool,
  searchReposTool,
  listIssuesTool,
  createIssueTool,
]
