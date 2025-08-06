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
export declare class GitHubClient {
    private readonly octokit;
    constructor(token?: string);
    getOrganizationRepos(org: string): Promise<Repository[]>;
    getUserRepos(username: string): Promise<Repository[]>;
    getDocumentationFiles(owner: string, repo: string, docsPath?: string): Promise<DocumentFile[]>;
    getFileContent(owner: string, repo: string, path: string): Promise<string | null>;
    getFileLastModified(owner: string, repo: string, path: string): Promise<string>;
    getLatestCommitHash(owner: string, repo: string, path?: string): Promise<string | null>;
    searchRepositories(query: string, org?: string): Promise<Repository[]>;
    checkRateLimit(): Promise<{
        remaining: number;
        resetTime: Date;
    }>;
}
//# sourceMappingURL=github-client.d.ts.map