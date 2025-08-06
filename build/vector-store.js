import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
export class VectorStore {
    db;
    constructor(dbPath = "./data/github-docs.db") {
        // Ensure the directory exists
        const dbDir = dirname(dbPath);
        try {
            mkdirSync(dbDir, { recursive: true });
        }
        catch (error) {
            // Directory might already exist, ignore error
        }
        this.db = new Database(dbPath);
        this.initializeDatabase();
    }
    initializeDatabase() {
        // Create documents table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        commit_hash TEXT,
        UNIQUE(repo, file_path, content)
      )
    `);
        // Create embeddings table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
      )
    `);
        // Create indexes for better performance
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_repo ON documents(repo);
      CREATE INDEX IF NOT EXISTS idx_file_path ON documents(file_path);
      CREATE INDEX IF NOT EXISTS idx_last_updated ON documents(last_updated);
    `);
    }
    async addDocument(doc) {
        const insertDoc = this.db.prepare(`
      INSERT OR REPLACE INTO documents (repo, file_path, content, metadata, last_updated, commit_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        const result = insertDoc.run(doc.repo, doc.filePath, doc.content, JSON.stringify(doc.metadata), doc.metadata.lastUpdated, doc.metadata.commitHash);
        const documentId = result.lastInsertRowid;
        // Store embedding as binary data
        const embeddingBuffer = Buffer.from(new Float32Array(doc.embedding).buffer);
        const insertEmbedding = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (document_id, embedding)
      VALUES (?, ?)
    `);
        insertEmbedding.run(documentId, embeddingBuffer);
        return documentId;
    }
    async searchSimilar(queryEmbedding, limit = 10, repoFilter) {
        const queryBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);
        let sql = `
      SELECT 
        d.id, d.repo, d.file_path, d.content, d.metadata, d.last_updated, d.commit_hash,
        e.embedding
      FROM documents d
      JOIN embeddings e ON d.id = e.document_id
    `;
        const params = [];
        if (repoFilter && repoFilter.length > 0) {
            const placeholders = repoFilter.map(() => "?").join(",");
            sql += ` WHERE d.repo IN (${placeholders})`;
            params.push(...repoFilter);
        }
        sql += ` ORDER BY d.last_updated DESC LIMIT ?`;
        params.push(limit * 3); // Get more results for similarity calculation
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        // Calculate cosine similarity
        const results = [];
        for (const row of rows) {
            const rowData = row;
            const docEmbedding = new Float32Array(rowData.embedding.buffer);
            const similarity = this.cosineSimilarity(queryEmbedding, Array.from(docEmbedding));
            results.push({
                document: {
                    id: rowData.id,
                    repo: rowData.repo,
                    filePath: rowData.file_path,
                    content: rowData.content,
                    embedding: Array.from(docEmbedding),
                    metadata: JSON.parse(rowData.metadata),
                },
                similarity,
            });
        }
        // Sort by similarity and return top results
        return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }
    cosineSimilarity(a, b) {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        if (magnitudeA === 0 || magnitudeB === 0)
            return 0;
        return dotProduct / (magnitudeA * magnitudeB);
    }
    async getDocumentsByRepo(repo) {
        const stmt = this.db.prepare(`
      SELECT d.*, e.embedding
      FROM documents d
      JOIN embeddings e ON d.id = e.document_id
      WHERE d.repo = ?
      ORDER BY d.last_updated DESC
    `);
        const rows = stmt.all(repo);
        return rows.map((row) => ({
            id: row.id,
            repo: row.repo,
            filePath: row.file_path,
            content: row.content,
            embedding: Array.from(new Float32Array(row.embedding.buffer)),
            metadata: JSON.parse(row.metadata),
        }));
    }
    async deleteRepo(repo) {
        const stmt = this.db.prepare("DELETE FROM documents WHERE repo = ?");
        stmt.run(repo);
    }
    async getRepoStats() {
        const stmt = this.db.prepare(`
      SELECT 
        repo,
        COUNT(*) as doc_count,
        MAX(last_updated) as last_updated
      FROM documents
      GROUP BY repo
      ORDER BY repo
    `);
        return stmt.all().map((row) => ({
            repo: row.repo,
            docCount: row.doc_count,
            lastUpdated: row.last_updated,
        }));
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=vector-store.js.map