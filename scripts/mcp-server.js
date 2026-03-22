#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { generate, listModels, checkHealth } = require("./generate.js");

const server = new Server(
  {
    name: "drawthings-agent",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Define available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "Generate an image using Draw Things local AI backend.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Positive prompt for the image." },
            negativePrompt: { type: "string", description: "Negative prompt to exclude elements." },
            width: { type: "number", description: "Image width (default: 1024)", default: 1024 },
            height: { type: "number", description: "Image height (default: 576)", default: 576 },
            steps: { type: "number", description: "Number of sampling steps (default: 8)", default: 8 },
            seed: { type: "number", description: "Random seed (0 for random)", default: 0 },
            guidance: { type: "number", description: "Guidance scale (default: 1.0)", default: 1.0 },
            model: { type: "string", description: "Model filename (e.g. z_image_turbo_1.0_q6p.ckpt)" },
            upscale: { type: "number", description: "Upscale factor (1, 2, or 4)", default: 1 },
            upscaler: { type: "string", description: "Upscaler model name", default: "realesrgan_x4plus_f16.ckpt" }
          },
          required: ["prompt"],
        },
      },
      {
        name: "list_models",
        description: "List all available models and upscalers on the Draw Things server.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "check_health",
        description: "Check if the Draw Things gRPC server is online and healthy.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

/**
 * Handle tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name === "generate_image") {
      const result = await generate({
        prompt: args.prompt,
        negativePrompt: args.negativePrompt || "",
        width: args.width || 1024,
        height: args.height || 576,
        steps: args.steps || 8,
        seed: args.seed || 0,
        guidance: args.guidance || 1.0,
        model: args.model || "z_image_turbo_1.0_q6p.ckpt",
        upscale: args.upscale || 1,
        upscaler: args.upscaler || "realesrgan_x4plus_f16.ckpt",
        sampler: "unicpc-trailing"
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully generated image.\nPath: ${result.path}\nSeed: ${result.seed}`,
          },
        ],
      };
    }

    if (name === "list_models") {
      const result = await listModels({});
      return {
        content: [
          {
            type: "text",
            text: `Available Models:\n${result.models.join("\n")}\n\nAvailable Upscalers:\n${result.upscalers.join("\n")}`,
          },
        ],
      };
    }

    if (name === "check_health") {
      const result = await checkHealth({});
      return {
        content: [
          {
            type: "text",
            text: `Server Status: ${result.message}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Draw Things MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
