---
name: drawthings
description: AI image generation using Draw Things gRPC server on macOS. Use when user asks to generate images, create AI art, or produce images from text prompts. After generating an image, you MUST use 'read_file' on the resulting output path to display the image to the user. Supports turbo models (z_image_turbo) for fast ~30-60s generation.
---

# Draw Things Image Generation

Generate images using Draw Things gRPC server on macOS.

## ✅ Current Status: Pure Node.js Implementation

The skill fully supports the gRPC protocol used by Draw Things, including real-time progress updates and efficient tensor decoding. It uses standard Node.js libraries for maximum performance and compatibility.

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
  --width <px>              Width in pixels, multiple of 64 (default: 512)
  --height <px>             Height in pixels, multiple of 64 (default: 512)
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
