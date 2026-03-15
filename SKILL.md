---
name: drawthings
description: AI image generation using Draw Things gRPC server on macOS. Use when user asks to generate images, create AI art, or produce images from text prompts. You MUST inform the user that generation will take about 1-2 minutes (60-120s) before starting. After generating, you MUST use 'read_file' on the resulting output path to display the image. Supports turbo models (z_image_turbo).
---

# Draw Things Image Generation

Generate images using a long-running Draw Things gRPC server on macOS.

## Service Management

The Draw Things server should be managed as a persistent background service.

### ⚠️ AI CRITICAL SERVICE MANAGEMENT RULES
- **FORBIDDEN**: NEVER manually execute the Draw Things server binary (e.g., `gRPCServerCLI-macOS`).
- **FORBIDDEN**: NEVER manually `kill` or `pkill` the server process.
- **MANDATORY**: ALWAYS use the provided `npm` scripts below. These scripts ensure correct TLS settings, log redirection, and environment variable loading.
- **MANDATORY**: If the server configuration in `.env` changes, you MUST use `npm run server:restart`.

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

### 3. Restart the Server
Use this to apply `.env` changes or recover from an unstable state:
```bash
# Use when configuration changes or server is unresponsive
npm run server:restart
```

### 4. Stop the Server
When image generation tasks are finished for the day, free up system resources:
```bash
npm run server:stop
```

## Generation Task

Use `scripts/generate.js` for image generation. It automatically waits for the server to be ready.

### ⚠️ AI CRITICAL INSTRUCTIONS
- **UPSCALING IS NOT A POST-PROCESS**: You **MUST** include the `--upscale` parameter at the **initial time of generation**. You cannot generate an image first and then "apply" an upscale later with this script. If the user wants a high-resolution or 4K image, you MUST include `--upscale 2` or `--upscale 4` in your very first command.
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

### Parameter Optimization Guidelines
- **Steps (`--steps`)**: 
  - For `z_image_turbo`: Use **4-10 steps** (Default: 8). Going higher adds little quality but more time.
  - For standard SDXL/SD1.5: Use **20-35 steps**.
- **Guidance (`--guidance`)**: 
  - For Turbo models: Keep it low, **1.0 - 2.0**.
  - For standard models: **7.0 - 9.0** is usually best.
- **Samplers (`--sampler`)**:
  - `unicpc-trailing`: Best for most cases.
  - `euler-a-trailing`: Good for artistic/diverse results.
- **Negative Prompt (`--negative-prompt`)**: Always include "blurry, low quality, distorted" if the user wants high quality but hasn't provided a negative prompt.

- **Resolution (`--width`, `--height`)**: 
  - **MANDATORY**: Both width and height MUST be multiples of **64**.
  - **Standard (16:9)**: `--width 1024 --height 576` (Default).
  - **Portrait (9:16)**: `--width 576 --height 1024`.
  - **Square (1:1)**: `--width 1024 --height 1024` or `--width 512 --height 512`.
  - **Classic (4:3)**: `--width 1024 --height 768`.
  - **Cinema (21:9)**: `--width 1344 --height 576`.
  - **Note**: Larger resolutions (e.g., >1024px) significantly increase generation time and memory usage.

- **LoRAs (`--lora`)**:
  - Format: `--lora "lora_filename.ckpt:weight"`.
  - Multiple LoRAs: You can use this flag multiple times.
  - Weight: Typically **0.1 to 1.0**.
  - Example: `--lora "pixel_art:0.8" --lora "vibrant_colors:0.5"`.

- **Refiner (`--refiner-model`, `--refiner-start`)**:
  - **Refiner Model**: A second model used to refine details in the last steps (e.g., an SDXL refiner).
  - **Refiner Start**: Percentage of total steps after which to switch to the refiner (Default: **0.7**, range 0.0-1.0).
  - Example: `--model "sd_xl_base.ckpt" --refiner-model "sd_xl_refiner.ckpt" --refiner-start 0.8`.

- **Upscaling (`--upscale`, `--upscaler`)**:
  - **Scale Factor**: Use `--upscale 2` or `--upscale 4`. **MANDATORY**: Only use integer factors (2 or 4).
  - **4K Goal**: To reach ~4K resolution, start with `--width 1024 --height 576` and use `--upscale 4`.
  - **Upscaler Model**: Default is `realesrgan_x4plus_f16.ckpt` (ESRGAN). This is highly recommended for most photographic and artistic content.
  - **Note**: Upscaling happens **natively** on the Draw Things server after the initial generation. It adds significant processing time (30-60s extra) but produces high-fidelity results.

### Usage Examples with Advanced Parameters
```bash
# Generate high quality 4K art with a specific style (LoRA)
node scripts/generate.js --prompt "a cybernetic owl" --lora "tech_style:0.7" --upscale 4

# Use SDXL with Refiner for maximum detail
node scripts/generate.js --prompt "portrait of a wizard" --model "sd_xl_base.ckpt" --refiner-model "sd_xl_refiner.ckpt" --steps 30
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
