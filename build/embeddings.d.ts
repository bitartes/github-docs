export interface TextChunk {
    content: string;
    title?: string;
    section?: string;
}
export declare class EmbeddingsService {
    private readonly openai;
    private readonly markdown;
    constructor(apiKey?: string);
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    chunkMarkdownContent(content: string, filePath: string): TextChunk[];
    private extractTitleFromPath;
    createQueryEmbedding(query: string): Promise<number[]>;
    calculateTokenCount(text: string): number;
    estimateCost(texts: string[]): Promise<{
        tokens: number;
        estimatedCost: number;
    }>;
}
//# sourceMappingURL=embeddings.d.ts.map