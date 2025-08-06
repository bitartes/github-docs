# GitHub Documentation MCP with Proactive Development Insights

An enhanced Model Context Protocol (MCP) server that provides intelligent documentation search and proactive development insights for GitHub repositories. This tool helps development teams by automatically analyzing dependencies, detecting potential breaking changes, and providing contextual recommendations during feature development.

## Features

### Core Documentation Features

- **Semantic Documentation Search**: Search across indexed documentation using natural language queries
- **Automatic Repository Indexing**: Automatically index documentation from GitHub organization repositories
- **Dependency Analysis**: Find relationships and dependencies between services
- **Repository Statistics**: Get insights about indexed documentation

### 🚀 NEW: Proactive Development Insights

- **Feature Impact Analysis**: Analyze potential impact of feature changes across services
- **Breaking Change Detection**: Automatically detect and alert about potential breaking changes
- **Development Recommendations**: Get contextual best practices and guidance
- **Real-time Dependency Alerts**: Receive alerts when modifying features that other services depend on

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd github-docs-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

4. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

## Environment Variables

```bash
# Required
GITHUB_TOKEN=your_github_token_here
OPENAI_API_KEY=your_openai_api_key_here
GITHUB_ORG=your_organization_name

# Optional - Proactive Alerts Configuration
ENABLE_PROACTIVE_ALERTS=true
ALERT_THRESHOLD=0.75

# Optional - Auto-indexing
AUTO_INDEX_ENABLED=true
AUTO_INDEX_INTERVAL_HOURS=24
```

## Configuration

### Alert Threshold

The `ALERT_THRESHOLD` (default: 0.75) determines how similar content must be to trigger alerts:

- **0.9+**: Very strict - only highly relevant matches
- **0.75**: Balanced - good mix of precision and recall
- **0.6**: Permissive - more results, may include less relevant matches

## Available Tools

### Documentation Tools

- `list_org_repos`: List all repositories in your GitHub organization
- `index_repo_docs`: Index documentation from a specific repository
- `search_docs`: Search across indexed documentation
- `get_repo_stats`: Get statistics about indexed repositories
- `find_dependencies`: Find dependencies for a specific service

### 🆕 Proactive Development Tools

#### `analyze_feature_impact`

Analyze the potential impact of feature changes across your services.

**Parameters:**

- `feature`: Feature or component being modified
- `changeType`: Type of change (`add`, `modify`, `remove`, `deprecate`)
- `service` (optional): Service where the change is being made
- `description` (optional): Description of the change

**Example Usage:**

```typescript
// Analyze impact of removing a login endpoint
analyze_feature_impact({
  feature: "login API",
  changeType: "remove",
  service: "user-service",
  description: "Removing deprecated v1 login endpoint",
});
```

**Output:**

- 🚨 **Breaking change alerts** for removals/deprecations
- ⚠️ **Impact analysis** for modifications
- 💡 **Similar feature detection** for additions
- 🧪 **Testing guidance** when available
- 🚀 **Deployment considerations**

#### `get_dev_recommendations`

Get development recommendations and best practices for specific contexts.

**Parameters:**

- `context`: Development context (service name, feature, or technology)
- `type` (optional): Focus area (`best-practices`, `patterns`, `security`, `performance`, `testing`)

**Example Usage:**

```typescript
// Get security recommendations for payment service
get_dev_recommendations({
  context: "payment service",
  type: "security",
});
```

#### `check_breaking_changes`

Check for potential breaking changes when modifying APIs or services.

**Parameters:**

- `service`: Service being modified
- `endpoint` (optional): Specific API endpoint being changed
- `changeDescription`: Description of the change being made

**Example Usage:**

```typescript
// Check breaking changes for API modification
check_breaking_changes({
  service: "user-service",
  endpoint: "/api/v1/auth/login",
  changeDescription: "Changing response format to include additional user metadata",
});
```

## Usage Examples

### Basic Documentation Search

```typescript
// Search for authentication-related documentation
search_docs({
  query: "authentication login JWT token",
  limit: 5,
});
```

### Proactive Development Workflow

#### 1. Before Making Changes

```typescript
// Analyze impact before modifying a feature
analyze_feature_impact({
  feature: "payment processing",
  changeType: "modify",
  service: "payment-service",
  description: "Adding support for new payment provider",
});
```

#### 2. Check for Breaking Changes

```typescript
// Check if your API changes might break other services
check_breaking_changes({
  service: "payment-service",
  endpoint: "/api/v1/payments",
  changeDescription: "Adding required field 'currency' to payment request",
});
```

#### 3. Get Development Guidance

```typescript
// Get best practices for your specific context
get_dev_recommendations({
  context: "payment service integration",
  type: "best-practices",
});
```

## Integration with Development Workflow

### IDE Integration

Configure your IDE to use this MCP server for:

- Real-time dependency analysis while coding
- Automatic breaking change detection on save
- Contextual documentation suggestions

### CI/CD Integration

Use the proactive tools in your CI/CD pipeline:

```bash
# Example: Check for breaking changes in PR
mcp-client analyze_feature_impact \
  --feature="user authentication" \
  --changeType="modify" \
  --service="user-service"
```

### Team Notifications

Set up automated alerts for:

- Breaking changes detected in PRs
- High-impact feature modifications
- Missing documentation for new features

## Best Practices

### 1. Regular Documentation Updates

- Keep documentation in sync with code changes
- Use consistent naming conventions across services
- Document API contracts and dependencies clearly

### 2. Proactive Change Management

- Always run impact analysis before major changes
- Check for breaking changes in code reviews
- Use development recommendations for new features

### 3. Team Communication

- Share breaking change alerts with affected teams
- Document migration strategies for deprecated features
- Maintain a service dependency map

## Troubleshooting

### Common Issues

**No results from proactive tools:**

- Ensure repositories are properly indexed
- Check that documentation contains relevant keywords
- Verify `ALERT_THRESHOLD` is not too strict

**False positive alerts:**

- Adjust `ALERT_THRESHOLD` to be more restrictive
- Improve documentation specificity
- Use more precise feature names

**Missing dependencies:**

- Ensure all relevant repositories are indexed
- Check that service names are consistent across documentation
- Verify documentation includes dependency information

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:

- Create an issue in the GitHub repository
- Check the troubleshooting section
- Review the example usage patterns
