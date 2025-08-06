export interface DocumentChunk {
    id?: number;
    repo: string;
    filePath: string;
    content: string;
    embedding: number[];
    metadata: {
        title?: string;
        section?: string;
        lastUpdated: string;
        commitHash?: string;
    };
}
export interface SearchResult {
    document: DocumentChunk;
    similarity: number;
}
export declare class VectorStore {
    private db;
    constructor(dbPath?: string);
    private initializeDatabase;
    addDocument(doc: DocumentChunk): Promise<number>;
    searchSimilar(queryEmbedding: number[], limit?: number, repoFilter?: string[]): Promise<SearchResult[]>;
    private cosineSimilarity;
    getDocumentsByRepo(repo: string): Promise<DocumentChunk[]>;
    deleteRepo(repo: string): Promise<void>;
    getRepoStats(): Promise<{
        repo: string;
        docCount: number;
        lastUpdated: string;
    }[]>;
    close(): void;
}
//# sourceMappingURL=vector-store.d.ts.map