#!/usr/bin/env node

// Test the new proactive tools
async function testProactiveTools() {
  console.log("🧪 Enhanced GitHub Documentation MCP with Proactive Tools\n");

  // Test cases for the new tools
  const testCases = [
    {
      name: "Feature Impact Analysis",
      tool: "analyze_feature_impact",
      params: {
        feature: "login API",
        changeType: "modify",
        service: "user-service",
        description: "Adding two-factor authentication support",
      },
    },
    {
      name: "Development Recommendations",
      tool: "get_dev_recommendations",
      params: {
        context: "payment service",
        type: "security",
      },
    },
    {
      name: "Breaking Change Check",
      tool: "check_breaking_changes",
      params: {
        service: "payment-service",
        endpoint: "/api/v1/payments",
        changeDescription: "Adding required field currency to payment request",
      },
    },
  ];

  console.log("Available test cases:");
  testCases.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name} (${test.tool})`);
  });

  console.log("\n📋 To test these tools, use them through your MCP client or IDE integration.");
  console.log("📋 The tools are now available in the enhanced MCP server.");

  console.log("\n🚀 Enhanced Features Added:");
  console.log("✅ analyze_feature_impact - Analyze potential impact of feature changes");
  console.log("✅ get_dev_recommendations - Get contextual development guidance");
  console.log("✅ check_breaking_changes - Detect potential breaking changes");

  console.log("\n🔧 Configuration:");
  console.log("- ENABLE_PROACTIVE_ALERTS: Controls proactive alert features");
  console.log("- ALERT_THRESHOLD: Similarity threshold for triggering alerts (default: 0.75)");

  console.log("\n📖 See README.md for detailed usage examples and integration guide.");
}

testProactiveTools().catch(console.error);
