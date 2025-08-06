import { Octokit } from "@octokit/rest";

export interface Repository {
  name: string;
  fullName: string;
  description?: string;
  defaultBranch: string;
  updatedAt: string;
  private: boolean;
}

export interface DocumentFile {
  path: string;
  content: string;
  sha: string;
  lastModified: string;
}

export class GitHubClient {
  private readonly octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: "github-docs-mcp/1.0.0",
    });
  }

  async getOrganizationRepos(org: string): Promise<Repository[]> {
    try {
      const { data } = await this.octokit.rest.repos.listForOrg({
        org,
        type: "all",
        sort: "updated",
        per_page: 100,
      });

      return data.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || undefined,
        defaultBranch: repo.default_branch || "main",
        updatedAt: repo.updated_at || new Date().toISOString(),
        private: repo.private,
      }));
    } catch (error) {
      console.error(`Error fetching repos for org ${org}:`, error);
      throw new Error(`Failed to fetch repositories for organization: ${org}`);
    }
  }

  async getUserRepos(username: string): Promise<Repository[]> {
    try {
      const { data } = await this.octokit.rest.repos.listForUser({
        username,
        type: "all",
        sort: "updated",
        per_page: 100,
      });

      return data.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || undefined,
        defaultBranch: repo.default_branch || "main",
        updatedAt: repo.updated_at || new Date().toISOString(),
        private: repo.private,
      }));
    } catch (error) {
      console.error(`Error fetching repos for user ${username}:`, error);
      throw new Error(`Failed to fetch repositories for user: ${username}`);
    }
  }

  async getDocumentationFiles(owner: string, repo: string, docsPath: string = "docs"): Promise<DocumentFile[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: docsPath,
      });

      if (!Array.isArray(data)) {
        throw new Error(`${docsPath} is not a directory`);
      }

      const markdownFiles = data.filter((file) => file.type === "file" && file.name.toLowerCase().endsWith(".md"));

      const documentFiles: DocumentFile[] = [];

      for (const file of markdownFiles) {
        try {
          const content = await this.getFileContent(owner, repo, file.path);
          if (content) {
            documentFiles.push({
              path: file.path,
              content,
              sha: file.sha,
              lastModified: await this.getFileLastModified(owner, repo, file.path),
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch content for ${file.path}:`, error);
        }
      }

      return documentFiles;
    } catch (error) {
      if ((error as any).status === 404) {
        console.warn(`Documentation folder '${docsPath}' not found in ${owner}/${repo}`);
        return [];
      }
      console.error(`Error fetching docs from ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(data) || data.type !== "file") {
        return null;
      }

      if (data.encoding === "base64" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      return null;
    } catch (error) {
      console.error(`Error fetching file content for ${path}:`, error);
      return null;
    }
  }

  async getFileLastModified(owner: string, repo: string, path: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        path,
        per_page: 1,
      });

      if (data.length > 0) {
        return data[0].commit.committer?.date || new Date().toISOString();
      }

      return new Date().toISOString();
    } catch (error) {
      console.warn(`Could not get last modified date for ${path}:`, error);
      return new Date().toISOString();
    }
  }

  async getLatestCommitHash(owner: string, repo: string, path?: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        path,
        per_page: 1,
      });

      return data.length > 0 ? data[0].sha : null;
    } catch (error) {
      console.error(`Error getting latest commit hash:`, error);
      return null;
    }
  }

  async searchRepositories(query: string, org?: string): Promise<Repository[]> {
    try {
      const searchQuery = org ? `${query} org:${org}` : query;

      const { data } = await this.octokit.rest.search.repos({
        q: searchQuery,
        sort: "updated",
        per_page: 50,
      });

      return data.items.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || undefined,
        defaultBranch: repo.default_branch || "main",
        updatedAt: repo.updated_at || new Date().toISOString(),
        private: repo.private,
      }));
    } catch (error) {
      console.error(`Error searching repositories:`, error);
      throw new Error(`Failed to search repositories: ${query}`);
    }
  }

  async checkRateLimit(): Promise<{ remaining: number; resetTime: Date }> {
    try {
      const { data } = await this.octokit.rest.rateLimit.get();

      return {
        remaining: data.rate.remaining,
        resetTime: new Date(data.rate.reset * 1000),
      };
    } catch (error) {
      console.error("Error checking rate limit:", error);
      throw error;
    }
  }
}
