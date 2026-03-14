---
name: drawthings
description: AI image generation using Draw Things gRPC server on macOS. Use when user asks to generate images, create AI art, or produce images from text prompts. You MUST inform the user that generation will take about 1-2 minutes (60-120s) before starting. After generating, you MUST use 'read_file' on the resulting output path to display the image. Supports turbo models (z_image_turbo).
---

# Draw Things Image Generation

Generate images using a long-running Draw Things gRPC server on macOS.

## Service Management

The Draw Things server should be managed as a persistent background service.

### ⚠️ AI CRITICAL STATUS INSTRUCTIONS
- **DO NOT use `ps`, `lsof`, `netstat`, or `curl`** to check if the server is "ready". A running process or open port does NOT mean the server can generate images (it might still be loading models).
- **ONLY use `npm run server:status`** to check readiness. This command performs a real gRPC handshake which is the only authoritative way to confirm the server is functional.
- If `server:status` fails but `server:start` was recently called, **WAIT and retry** the status check after 10-20 seconds.

### 1. Check Server Status
Always check if the server is truly ready using the official script:
```bash
npm run server:status
```

### 2. Start the Server
If status check fails, start the server in the background:
```bash
# Must be run with is_background: true
npm run server:start
```
The server may take 30-60 seconds to load models. Generation scripts will automatically wait for it.

### 3. Stop the Server
When image generation tasks are finished for the day, free up system resources:
```bash
npm run server:stop
```

## Generation Task

Use `scripts/generate.js` for image generation. It automatically waits for the server to be ready.

### ⚠️ AI CRITICAL INSTRUCTIONS
- **NEVER truncate the prompt**: Provide the FULL text. No ellipses `...` or `…`.
- **STRICT QUOTING**: 
  - Always use balanced quotes. For every opening quote (`'` or `"`), there MUST be a closing quote.
  - Prefer single quotes `'prompt text'` for the `--prompt` argument to avoid shell interpolation issues, unless the prompt itself contains a single quote.
  - **NEVER** leave a command ending with a backtick `` ` `` or a single unmatched quote.
- **NO TRAILING SYMBOLS**: Ensure the command ends exactly after the last argument. Do not add any extra periods, backticks, or "smart" characters at the end.
- **Avoid smart characters**: Ensure all arguments use standard ASCII characters.

## Prerequisites

-   **Draw Things**: Installed on macOS.
-   **gRPC Server**: Running (via `npm run start-server` or manually).
-   **CRITICAL SETTING**: In Draw Things settings, **DISABLE "Response Compression"** (also known as FPY). This script does not support FPY compressed tensors.

## Configuration

Before using this skill, you must configure the paths to your Draw Things gRPC server and models.

1.  Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and fill in the paths:
    - `DRAWTHINGS_SERVER_PATH`: Full path to the `gRPCServerCLI-macOS` binary.
    - `DRAWTHINGS_MODELS_PATH`: Full path to your models directory.

## Quick Start

```bash
# Start the server
npm run start-server

# Generate an image (in a new terminal)
node scripts/generate.js --prompt "a cat sitting on a windowsill" --output cat.png
```

## Server Setup

The gRPC server must be running before generating images. You can start it in two ways:

### Option A: Use Draw Things App (Easiest)
1. Open **Draw Things** on your Mac.
2. Go to **Settings** and enable **gRPC Server**.
3. Note the address (default `127.0.0.1:7859`) and TLS setting.
4. Configure your `.env` to match these settings.

### Option B: Use Command Line (Headless)
Once configured in `.env`, simply run:
```bash
npm run start-server
```
Server listens on `127.0.0.1:7859`. First request takes ~30s extra for model loading.

### Check Server Status

```bash
# Start in background
nohup npm run start-server > drawthings-grpc-server.log 2>&1 &

# Save PID
echo $! > drawthings-grpc-server.pid
```

## Generation Script

See `scripts/generate.js` for the Node.js CLI.

### Usage

```bash
node scripts/generate.js [options]

Options:
  --prompt <text>           Text prompt (required)
  --negative-prompt <text>  Things to avoid
  --width <px>              Width in pixels, multiple of 64 (default: 1024)
  --height <px>             Height in pixels, multiple of 64 (default: 576)
  --steps <n>               Inference steps (default: 8)
  --seed <n>                Random seed, 0=random (default: 0)
  --guidance <f>            Guidance scale (default: 1.0)
  --sampler <name>          Sampler algorithm (default: unicpc-trailing)
  --model <filename>        Model filename (default: z_image_turbo_1.0_q6p.ckpt)
  --output <path>           Output PNG file path
  --addr <host:port>        gRPC server address (default: 127.0.0.1:7859)
  --health                  Check server health
  --list-models             List available models
```

### Examples

```bash
# Basic generation
node scripts/generate.js --prompt "a beautiful sunset over mountains"

# List available models
node scripts/generate.js --list-models

# High resolution
node scripts/generate.js --prompt "epic fantasy landscape" --width 1024 --height 768 --steps 12

# Fixed seed for reproducibility
node scripts/generate.js --prompt "portrait of a dog" --seed 12345 --output dog.png
```

## Available Models

Default models detected on system:
- `z_image_turbo_1.0_q6p.ckpt` — Fast turbo model (default, ~30-60s)
- `flux_1_vae_f16.ckpt` — Flux VAE
- `qwen_3_vl_4b_instruct_q8p.ckpt` — Qwen VL (vision-language)
- `moondream1_q6p.ckpt` — Moondream (vision-language)
- `siglip_384_q8p.ckpt` — SigLIP (vision encoder)

## Samplers

See `references/samplers.md` for detailed sampler documentation.

Recommended for z-image-turbo:
- `unicpc-trailing` (default) — Best quality/speed balance
- `euler-a-trailing` — More diverse results
- `dpmpp2m-ays` — Optimized for 5-10 steps

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `connection refused` | Server not running. Start with gRPCServerCLI-macOS |
| `DEADLINE_EXCEEDED` | Server still loading model. Retry. |
| `gRPC Error: 12 UNIMPLEMENTED` | Ensure you are using the correct `imageService.proto` and server version. |

## gRPC Protocol

The skill uses `@grpc/grpc-js` and `protoLoader` to communicate with the Draw Things server. Image data is returned as raw tensors and decoded to PNG using a custom Node.js implementation of Float16 decoding.
