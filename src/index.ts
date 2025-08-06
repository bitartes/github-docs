import "dotenv/config.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GitHubClient } from "./github-client.js";
import { VectorStore, DocumentChunk } from "./vector-store.js";
import { EmbeddingsService } from "./embeddings.js";

// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AUTO_INDEX_ORG = process.env.AUTO_INDEX_ORG || "bitartes"; // Default organization to auto-index
const AUTO_INDEX_INTERVAL = parseInt(process.env.AUTO_INDEX_INTERVAL || "3600000"); // Default: 1 hour in ms
const AUTO_INDEX_ON_STARTUP = process.env.AUTO_INDEX_ON_STARTUP !== "false"; // Default: true
const ENABLE_PROACTIVE_ALERTS = process.env.ENABLE_PROACTIVE_ALERTS !== "false"; // Default: true
const ALERT_THRESHOLD = parseFloat(process.env.ALERT_THRESHOLD || "0.7"); // Similarity threshold for alerts

// Initialize services
const githubClient = new GitHubClient(GITHUB_TOKEN);
const vectorStore = new VectorStore();
const embeddingsService = new EmbeddingsService(OPENAI_API_KEY);

// Auto-indexing functionality
async function autoIndexRepositories() {
  try {
    console.error(`Starting auto-indexing for organization: ${AUTO_INDEX_ORG}`);

    // Get all repositories in the organization
    const repos = await githubClient.getOrganizationRepos(AUTO_INDEX_ORG);
    console.error(`Found ${repos.length} repositories to index`);

    for (const repo of repos) {
      try {
        // Extract owner from fullName (e.g., "bitartes/user-service" -> "bitartes")
        const [owner, repoName] = repo.fullName.split("/");
        console.error(`Indexing ${owner}/${repoName}...`);

        // Check if repo has docs
        const files = await githubClient.getDocumentationFiles(owner, repoName);
        if (files.length === 0) {
          console.error(`No documentation found in ${owner}/${repoName}, skipping`);
          continue;
        }

        // Check if already indexed and up-to-date
        const stats = await vectorStore.getRepoStats();
        const existingRepo = stats.find((s) => s.repo === `${owner}/${repoName}`);

        if (existingRepo && new Date(existingRepo.lastUpdated) >= new Date(repo.updatedAt)) {
          console.error(`${owner}/${repoName} is already up-to-date, skipping`);
          continue;
        }

        // Index the repository
        for (const file of files) {
          const textChunks = embeddingsService.chunkMarkdownContent(file.content, file.path);

          for (const chunk of textChunks) {
            const embedding = await embeddingsService.generateEmbedding(chunk.content);

            const docChunk: DocumentChunk = {
              repo: `${owner}/${repoName}`,
              filePath: file.path,
              content: chunk.content,
              embedding,
              metadata: {
                title: chunk.title,
                section: chunk.section,
                lastUpdated: file.lastModified,
                commitHash: file.sha,
              },
            };

            // Store each chunk individually
            await vectorStore.addDocument(docChunk);
          }
        }

        console.error(`Successfully indexed documentation from ${owner}/${repoName}`);
      } catch (error) {
        console.error(`Error indexing ${repo.fullName}:`, error instanceof Error ? error.message : "Unknown error");
      }
    }

    console.error("Auto-indexing completed");
  } catch (error) {
    console.error("Error during auto-indexing:", error instanceof Error ? error.message : "Unknown error");
  }
}

// Set up periodic auto-indexing
let autoIndexTimer: NodeJS.Timeout | null = null;

function startAutoIndexing() {
  if (AUTO_INDEX_INTERVAL > 0) {
    autoIndexTimer = setInterval(autoIndexRepositories, AUTO_INDEX_INTERVAL);
    console.error(`Auto-indexing scheduled every ${AUTO_INDEX_INTERVAL / 1000 / 60} minutes`);
  }
}

// Create server instance
const server = new McpServer({
  name: "github-docs",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Tool: List organization repositories
server.tool(
  "list_org_repos",
  "List all repositories for a GitHub organization",
  {
    org: z.string().describe("GitHub organization name"),
    includePrivate: z.boolean().optional().describe("Include private repositories (requires appropriate token)"),
  },
  async ({ org, includePrivate = false }) => {
    try {
      const repos = await githubClient.getOrganizationRepos(org);
      const filteredRepos = includePrivate ? repos : repos.filter((repo) => !repo.private);

      const repoList = filteredRepos
        .map(
          (repo) =>
            `- **${repo.name}** (${repo.fullName})\n  ${repo.description || "No description"}\n  Last updated: ${new Date(
              repo.updatedAt
            ).toLocaleDateString()}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${filteredRepos.length} repositories in organization "${org}":\n\n${repoList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching repositories for organization "${org}": ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Index repository documentation
server.tool(
  "index_repo_docs",
  "Index documentation from a GitHub repository into the vector database",
  {
    owner: z.string().describe("Repository owner (user or organization)"),
    repo: z.string().describe("Repository name"),
    docsPath: z.string().optional().default("docs").describe("Path to documentation folder"),
    force: z.boolean().optional().default(false).describe("Force re-indexing even if already indexed"),
  },
  async ({ owner, repo, docsPath, force }) => {
    try {
      const repoFullName = `${owner}/${repo}`;

      // Check if repo is already indexed (unless force is true)
      if (!force) {
        const existingDocs = await vectorStore.getDocumentsByRepo(repoFullName);
        if (existingDocs.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Repository "${repoFullName}" is already indexed with ${existingDocs.length} documents. Use force=true to re-index.`,
              },
            ],
          };
        }
      }

      // Fetch documentation files
      const docFiles = await githubClient.getDocumentationFiles(owner, repo, docsPath);

      if (docFiles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No markdown documentation found in "${docsPath}" folder of ${repoFullName}`,
            },
          ],
        };
      }

      // Clear existing documents if force re-indexing
      if (force) {
        await vectorStore.deleteRepo(repoFullName);
      }

      let totalChunks = 0;
      let processedFiles = 0;

      for (const docFile of docFiles) {
        try {
          // Chunk the content
          const chunks = embeddingsService.chunkMarkdownContent(docFile.content, docFile.path);

          for (const chunk of chunks) {
            // Generate embedding
            const embedding = await embeddingsService.generateEmbedding(chunk.content);

            // Create document chunk
            const documentChunk: DocumentChunk = {
              repo: repoFullName,
              filePath: docFile.path,
              content: chunk.content,
              embedding,
              metadata: {
                title: chunk.title,
                section: chunk.section,
                lastUpdated: docFile.lastModified,
                commitHash: docFile.sha,
              },
            };

            // Store in vector database
            await vectorStore.addDocument(documentChunk);
            totalChunks++;
          }

          processedFiles++;
        } catch (error) {
          console.error(`Error processing file ${docFile.path}:`, error);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully indexed ${repoFullName}:\n- Processed ${processedFiles}/${docFiles.length} files\n- Created ${totalChunks} document chunks\n- Stored in vector database`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error indexing repository "${owner}/${repo}": ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Search documentation
server.tool(
  "search_docs",
  "Search across indexed documentation using semantic similarity",
  {
    query: z.string().describe("Search query"),
    repos: z.array(z.string()).optional().describe("Filter by specific repositories (format: owner/repo)"),
    limit: z.number().optional().default(5).describe("Maximum number of results to return"),
  },
  async ({ query, repos, limit }) => {
    try {
      // Generate query embedding
      const queryEmbedding = await embeddingsService.createQueryEmbedding(query);

      // Search vector database
      const results = await vectorStore.searchSimilar(queryEmbedding, limit, repos);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No relevant documentation found for query: "${query}"`,
            },
          ],
        };
      }

      const formattedResults = results.map((result, index) => {
        const doc = result.document;
        const similarity = (result.similarity * 100).toFixed(1);

        return [
          `## Result ${index + 1} (${similarity}% match)`,
          `**Repository:** ${doc.repo}`,
          `**File:** ${doc.filePath}`,
          doc.metadata.title ? `**Title:** ${doc.metadata.title}` : "",
          doc.metadata.section ? `**Section:** ${doc.metadata.section}` : "",
          `**Last Updated:** ${new Date(doc.metadata.lastUpdated).toLocaleDateString()}`,
          "",
          "**Content:**",
          doc.content.substring(0, 500) + (doc.content.length > 500 ? "..." : ""),
          "",
          "---",
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} relevant results for "${query}":\n\n${formattedResults.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching documentation: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Get repository statistics
server.tool("get_repo_stats", "Get statistics about indexed repositories", {}, async () => {
  try {
    const stats = await vectorStore.getRepoStats();

    if (stats.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No repositories have been indexed yet. Use 'index_repo_docs' to start indexing documentation.",
          },
        ],
      };
    }

    const totalDocs = stats.reduce((sum, stat) => sum + stat.docCount, 0);

    const repoList = stats
      .map((stat) => `- **${stat.repo}**: ${stat.docCount} documents (last updated: ${new Date(stat.lastUpdated).toLocaleDateString()})`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Indexed Repository Statistics:\n\n**Total Repositories:** ${stats.length}\n**Total Documents:** ${totalDocs}\n\n${repoList}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting repository statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});

// Tool: Find cross-dependencies
server.tool(
  "find_dependencies",
  "Find potential dependencies and relationships between services based on documentation",
  {
    service: z.string().describe("Service or component name to analyze"),
    repos: z.array(z.string()).optional().describe("Filter by specific repositories"),
  },
  async ({ service, repos }) => {
    try {
      // Search for mentions of the service
      const queries = [`${service} dependency`, `depends on ${service}`, `${service} integration`, `${service} API`, `${service} service`];

      const allResults = [];

      for (const query of queries) {
        const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
        const results = await vectorStore.searchSimilar(queryEmbedding, 3, repos);
        allResults.push(...results);
      }

      // Remove duplicates and sort by similarity
      const uniqueResults = allResults
        .filter((result, index, self) => index === self.findIndex((r) => r.document.id === result.document.id))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);

      if (uniqueResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No dependencies or relationships found for service "${service}" in the indexed documentation.`,
            },
          ],
        };
      }

      const formattedResults = uniqueResults.map((result, index) => {
        const doc = result.document;
        const similarity = (result.similarity * 100).toFixed(1);

        return [
          `### ${index + 1}. ${doc.repo} (${similarity}% relevance)`,
          `**File:** ${doc.filePath}`,
          doc.metadata.section ? `**Section:** ${doc.metadata.section}` : "",
          "",
          doc.content.substring(0, 300) + (doc.content.length > 300 ? "..." : ""),
          "",
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text",
            text: `Found ${uniqueResults.length} potential dependencies/relationships for "${service}":\n\n${formattedResults.join("\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error finding dependencies for "${service}": ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Check GitHub rate limit
server.tool("check_rate_limit", "Check GitHub API rate limit status", {}, async () => {
  try {
    const rateLimit = await githubClient.checkRateLimit();

    return {
      content: [
        {
          type: "text",
          text: `GitHub API Rate Limit Status:\n- Remaining requests: ${
            rateLimit.remaining
          }\n- Reset time: ${rateLimit.resetTime.toLocaleString()}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error checking rate limit: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});

// Tool: Analyze feature impact
server.tool(
  "analyze_feature_impact",
  "Analyze potential impact of a feature change across services and dependencies",
  {
    feature: z.string().describe("Feature or component being modified"),
    changeType: z.enum(["add", "modify", "remove", "deprecate"]).describe("Type of change being made"),
    service: z.string().optional().describe("Service where the change is being made"),
    description: z.string().optional().describe("Description of the change"),
  },
  async ({ feature, changeType, service, description }) => {
    try {
      const insights = [];
      const alerts = [];

      // Search for dependencies on this feature
      const dependencyQueries = [
        `${feature} dependency`,
        `depends on ${feature}`,
        `${feature} integration`,
        `${feature} API endpoint`,
        `calls ${feature}`,
        `uses ${feature}`,
      ];

      const allDependencies = [];
      for (const query of dependencyQueries) {
        const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
        const results = await vectorStore.searchSimilar(queryEmbedding, 5);
        allDependencies.push(...results);
      }

      // Remove duplicates and filter by threshold
      const uniqueDependencies = allDependencies
        .filter((result, index, self) => index === self.findIndex((r) => r.document.id === result.document.id))
        .filter((result) => result.similarity >= ALERT_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity);

      // Generate insights based on change type
      if (changeType === "remove" || changeType === "deprecate") {
        if (uniqueDependencies.length > 0) {
          alerts.push(
            `🚨 **BREAKING CHANGE ALERT**: ${uniqueDependencies.length} services may be affected by ${
              changeType === "remove" ? "removing" : "deprecating"
            } "${feature}"`
          );

          uniqueDependencies.slice(0, 5).forEach((dep, index) => {
            alerts.push(
              `${index + 1}. **${dep.document.repo}** (${(dep.similarity * 100).toFixed(1)}% match)\n   File: ${
                dep.document.filePath
              }\n   ${dep.document.content.substring(0, 150)}...`
            );
          });
        }
      }

      if (changeType === "modify") {
        if (uniqueDependencies.length > 0) {
          insights.push(`⚠️ **IMPACT ANALYSIS**: Modifying "${feature}" may affect ${uniqueDependencies.length} dependent services`);

          // Check for API contracts
          const apiQueries = [`${feature} API contract`, `${feature} interface`, `${feature} schema`];
          for (const query of apiQueries) {
            const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
            const apiResults = await vectorStore.searchSimilar(queryEmbedding, 3);

            if (apiResults.length > 0 && apiResults[0].similarity >= ALERT_THRESHOLD) {
              alerts.push(`📋 **API CONTRACT FOUND**: Review API contracts before modifying "${feature}"`);
              break;
            }
          }
        }
      }

      if (changeType === "add") {
        // Check for similar existing features
        const similarQueries = [`similar to ${feature}`, `${feature} alternative`, `${feature} equivalent`];
        for (const query of similarQueries) {
          const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
          const similarResults = await vectorStore.searchSimilar(queryEmbedding, 3);

          if (similarResults.length > 0 && similarResults[0].similarity >= ALERT_THRESHOLD) {
            insights.push(`💡 **SIMILAR FEATURE FOUND**: Consider reviewing existing implementations before adding "${feature}"`);
            insights.push(`   Found in: ${similarResults[0].document.repo} - ${similarResults[0].document.filePath}`);
            break;
          }
        }
      }

      // Check for testing requirements
      const testQueries = [`${feature} test`, `testing ${feature}`, `${feature} test cases`];
      for (const query of testQueries) {
        const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
        const testResults = await vectorStore.searchSimilar(queryEmbedding, 2);

        if (testResults.length > 0 && testResults[0].similarity >= ALERT_THRESHOLD) {
          insights.push(`🧪 **TESTING GUIDANCE**: Found testing documentation for "${feature}"`);
          insights.push(`   Reference: ${testResults[0].document.repo} - ${testResults[0].document.filePath}`);
          break;
        }
      }

      // Check for deployment considerations
      if (service) {
        const deployQueries = [`${service} deployment`, `${service} rollout`, `${service} migration`];
        for (const query of deployQueries) {
          const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
          const deployResults = await vectorStore.searchSimilar(queryEmbedding, 2);

          if (deployResults.length > 0 && deployResults[0].similarity >= ALERT_THRESHOLD) {
            insights.push(`🚀 **DEPLOYMENT INFO**: Found deployment guidance for "${service}"`);
            insights.push(`   Reference: ${deployResults[0].document.repo} - ${deployResults[0].document.filePath}`);
            break;
          }
        }
      }

      // Compile response
      const response = [];

      if (alerts.length > 0) {
        response.push("## 🚨 ALERTS\n");
        response.push(alerts.join("\n\n"));
        response.push("\n");
      }

      if (insights.length > 0) {
        response.push("## 💡 INSIGHTS\n");
        response.push(insights.join("\n\n"));
        response.push("\n");
      }

      if (uniqueDependencies.length > 0) {
        response.push("## 🔗 AFFECTED SERVICES\n");
        uniqueDependencies.slice(0, 10).forEach((dep, index) => {
          response.push(`${index + 1}. **${dep.document.repo}** (${(dep.similarity * 100).toFixed(1)}% relevance)`);
          response.push(`   File: ${dep.document.filePath}`);
          if (dep.document.metadata.section) {
            response.push(`   Section: ${dep.document.metadata.section}`);
          }
          response.push("");
        });
      }

      if (response.length === 0) {
        response.push(`No significant impacts or dependencies found for "${feature}" with change type "${changeType}".`);
        response.push("\nThis appears to be a low-risk change, but consider manual review of related services.");
      }

      return {
        content: [
          {
            type: "text",
            text: response.join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error analyzing feature impact: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Get development recommendations
server.tool(
  "get_dev_recommendations",
  "Get development recommendations and best practices for a specific service or feature",
  {
    context: z.string().describe("Development context (service name, feature, or technology)"),
    type: z
      .enum(["best-practices", "patterns", "security", "performance", "testing"])
      .optional()
      .describe("Type of recommendations to focus on"),
  },
  async ({ context, type }) => {
    try {
      const recommendations = [];

      // Build search queries based on type
      let queries = [];
      if (type) {
        switch (type) {
          case "best-practices":
            queries = [`${context} best practices`, `${context} guidelines`, `${context} standards`];
            break;
          case "patterns":
            queries = [`${context} patterns`, `${context} architecture`, `${context} design`];
            break;
          case "security":
            queries = [`${context} security`, `${context} authentication`, `${context} authorization`];
            break;
          case "performance":
            queries = [`${context} performance`, `${context} optimization`, `${context} scaling`];
            break;
          case "testing":
            queries = [`${context} testing`, `${context} test cases`, `${context} validation`];
            break;
        }
      } else {
        queries = [
          `${context} best practices`,
          `${context} guidelines`,
          `${context} patterns`,
          `${context} examples`,
          `${context} documentation`,
        ];
      }

      const allResults = [];
      for (const query of queries) {
        const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
        const results = await vectorStore.searchSimilar(queryEmbedding, 3);
        allResults.push(...results);
      }

      // Remove duplicates and sort by similarity
      const uniqueResults = allResults
        .filter((result, index, self) => index === self.findIndex((r) => r.document.id === result.document.id))
        .filter((result) => result.similarity >= 0.6) // Lower threshold for recommendations
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 8);

      if (uniqueResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No specific recommendations found for "${context}". Consider checking the general documentation or reaching out to the team for guidance.`,
            },
          ],
        };
      }

      const formattedResults = uniqueResults.map((result, index) => {
        const doc = result.document;
        const similarity = (result.similarity * 100).toFixed(1);

        return [
          `### ${index + 1}. ${doc.metadata.title || doc.filePath} (${similarity}% relevance)`,
          `**Repository:** ${doc.repo}`,
          `**File:** ${doc.filePath}`,
          doc.metadata.section ? `**Section:** ${doc.metadata.section}` : "",
          "",
          doc.content.substring(0, 400) + (doc.content.length > 400 ? "..." : ""),
          "",
          "---",
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text",
            text: `## 📚 Development Recommendations for "${context}"\n\n${formattedResults.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

// Tool: Check breaking changes
server.tool(
  "check_breaking_changes",
  "Check for potential breaking changes when modifying APIs or services",
  {
    service: z.string().describe("Service being modified"),
    endpoint: z.string().optional().describe("Specific API endpoint being changed"),
    changeDescription: z.string().describe("Description of the change being made"),
  },
  async ({ service, endpoint, changeDescription }) => {
    try {
      const breakingChangeIndicators = [
        "remove",
        "delete",
        "deprecate",
        "breaking",
        "incompatible",
        "version",
        "migration",
        "upgrade",
        "contract",
        "interface",
      ];

      const isLikelyBreaking = breakingChangeIndicators.some((indicator) => changeDescription.toLowerCase().includes(indicator));

      const searchQueries = [
        `${service} API contract`,
        `${service} interface`,
        `${service} dependencies`,
        `${service} consumers`,
        `${service} clients`,
      ];

      if (endpoint) {
        searchQueries.push(`${endpoint} endpoint`, `${endpoint} API`);
      }

      const allResults = [];
      for (const query of searchQueries) {
        const queryEmbedding = await embeddingsService.createQueryEmbedding(query);
        const results = await vectorStore.searchSimilar(queryEmbedding, 3);
        allResults.push(...results);
      }

      const uniqueResults = allResults
        .filter((result, index, self) => index === self.findIndex((r) => r.document.id === result.document.id))
        .filter((result) => result.similarity >= ALERT_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity);

      const response = [];

      if (isLikelyBreaking) {
        response.push("🚨 **POTENTIAL BREAKING CHANGE DETECTED**\n");
        response.push("Based on your change description, this may be a breaking change. Please review carefully.\n");
      }

      if (uniqueResults.length > 0) {
        response.push("## 📋 API Contracts & Dependencies Found\n");

        uniqueResults.slice(0, 5).forEach((result, index) => {
          const doc = result.document;
          response.push(`${index + 1}. **${doc.repo}** - ${doc.filePath}`);
          if (doc.metadata.section) {
            response.push(`   Section: ${doc.metadata.section}`);
          }
          response.push(`   Relevance: ${(result.similarity * 100).toFixed(1)}%`);
          response.push(`   Content: ${doc.content.substring(0, 200)}...`);
          response.push("");
        });

        response.push("## ✅ Recommended Actions\n");
        response.push("1. Review all identified contracts and dependencies");
        response.push("2. Update API documentation if interfaces change");
        response.push("3. Notify dependent service teams");
        response.push("4. Plan migration strategy if needed");
        response.push("5. Consider versioning for backward compatibility");
      } else {
        response.push("## ✅ No Critical Dependencies Found\n");
        response.push("No major API contracts or dependencies were found in the documentation.");
        response.push("However, consider manual review and team communication for safety.");
      }

      return {
        content: [
          {
            type: "text",
            text: response.join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error checking breaking changes: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub Docs MCP Server running on stdio");

  // Start auto-indexing if enabled
  if (AUTO_INDEX_ON_STARTUP) {
    console.error("Starting initial auto-indexing...");
    // Run initial indexing in background to not block server startup
    autoIndexRepositories().catch((error) => {
      console.error("Error during initial auto-indexing:", error);
    });
  }

  // Start periodic auto-indexing
  startAutoIndexing();
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down GitHub Docs MCP Server...");
  if (autoIndexTimer) {
    clearInterval(autoIndexTimer);
  }
  vectorStore.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down GitHub Docs MCP Server...");
  if (autoIndexTimer) {
    clearInterval(autoIndexTimer);
  }
  vectorStore.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error in main():", error);
  vectorStore.close();
  process.exit(1);
});
