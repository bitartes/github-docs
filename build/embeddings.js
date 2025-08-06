import OpenAI from 'openai';
import MarkdownIt from 'markdown-it';
export class EmbeddingsService {
    openai;
    markdown;
    constructor(apiKey) {
        this.openai = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
        });
        this.markdown = new MarkdownIt();
    }
    async generateEmbedding(text) {
        try {
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-3-small', // More cost-effective than text-embedding-3-large
                input: text.substring(0, 8000), // Limit to avoid token limits
            });
            return response.data[0].embedding;
        }
        catch (error) {
            console.error('Error generating embedding:', error);
            throw new Error('Failed to generate embedding');
        }
    }
    async generateEmbeddings(texts) {
        try {
            // Process in batches to avoid rate limits
            const batchSize = 100;
            const embeddings = [];
            for (let i = 0; i < texts.length; i += batchSize) {
                const batch = texts.slice(i, i + batchSize).map(text => text.substring(0, 8000) // Limit each text
                );
                const response = await this.openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: batch,
                });
                embeddings.push(...response.data.map(item => item.embedding));
                // Add a small delay between batches to respect rate limits
                if (i + batchSize < texts.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            return embeddings;
        }
        catch (error) {
            console.error('Error generating batch embeddings:', error);
            throw new Error('Failed to generate batch embeddings');
        }
    }
    chunkMarkdownContent(content, filePath) {
        const chunks = [];
        // Parse markdown to extract structure
        const tokens = this.markdown.parse(content, {});
        let currentSection = '';
        let currentContent = '';
        let currentTitle = this.extractTitleFromPath(filePath);
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'heading_open') {
                // Save previous chunk if it has content
                if (currentContent.trim()) {
                    chunks.push({
                        content: currentContent.trim(),
                        title: currentTitle,
                        section: currentSection || undefined,
                    });
                    currentContent = '';
                }
                // Get heading text
                const headingToken = tokens[i + 1];
                if (headingToken && headingToken.type === 'inline') {
                    if (token.tag === 'h1') {
                        currentTitle = headingToken.content;
                        currentSection = '';
                    }
                    else {
                        currentSection = headingToken.content;
                    }
                    currentContent += `# ${headingToken.content}\n\n`;
                }
            }
            else if (token.type === 'paragraph_open' || token.type === 'list_item_open' ||
                token.type === 'blockquote_open' || token.type === 'code_block') {
                // Collect content until we hit a size limit or new section
                let contentToAdd = '';
                if (token.type === 'code_block') {
                    contentToAdd = `\`\`\`\n${token.content}\n\`\`\`\n\n`;
                }
                else {
                    // Find the closing token and collect all content in between
                    let j = i + 1;
                    while (j < tokens.length && !tokens[j].type.endsWith('_close')) {
                        if (tokens[j].type === 'inline') {
                            contentToAdd += tokens[j].content + ' ';
                        }
                        j++;
                    }
                    contentToAdd += '\n\n';
                }
                // Check if adding this content would make the chunk too large
                if (currentContent.length + contentToAdd.length > 1500) {
                    // Save current chunk and start a new one
                    if (currentContent.trim()) {
                        chunks.push({
                            content: currentContent.trim(),
                            title: currentTitle,
                            section: currentSection || undefined,
                        });
                    }
                    currentContent = contentToAdd;
                }
                else {
                    currentContent += contentToAdd;
                }
            }
        }
        // Add the final chunk
        if (currentContent.trim()) {
            chunks.push({
                content: currentContent.trim(),
                title: currentTitle,
                section: currentSection || undefined,
            });
        }
        // If no chunks were created (e.g., very simple markdown), create one chunk with all content
        if (chunks.length === 0) {
            chunks.push({
                content: content.substring(0, 1500), // Limit size
                title: currentTitle,
            });
        }
        return chunks;
    }
    extractTitleFromPath(filePath) {
        const fileName = filePath.split('/').pop() || '';
        return fileName.replace(/\.md$/, '').replace(/[-_]/g, ' ');
    }
    async createQueryEmbedding(query) {
        // Enhance query with context for better matching
        const enhancedQuery = `Documentation search: ${query}`;
        return this.generateEmbedding(enhancedQuery);
    }
    calculateTokenCount(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    async estimateCost(texts) {
        const totalTokens = texts.reduce((sum, text) => sum + this.calculateTokenCount(text), 0);
        // text-embedding-3-small pricing: $0.00002 per 1K tokens
        const estimatedCost = (totalTokens / 1000) * 0.00002;
        return {
            tokens: totalTokens,
            estimatedCost: Math.round(estimatedCost * 10000) / 10000, // Round to 4 decimal places
        };
    }
}
//# sourceMappingURL=embeddings.js.map