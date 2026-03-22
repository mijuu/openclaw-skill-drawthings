# OpenClaw Skill: Draw Things AI Image Generation

[中文版](README_CN.md)

A high-performance Node.js skill for [OpenClaw](https://github.com/mijuu/openclaw) / Gemini CLI that enables local AI image generation using the [Draw Things](https://drawthings.ai/) gRPC backend on macOS.

## 🚀 Key Features

- **Centralized CLI**: Powerful `dt-skill` command for generation, configuration, and server management.
- **Auto-Discovery**: Automatically detects standard Draw Things model paths on macOS.
- **Memory Optimized**: Efficient large image transfers (up to 4K/8K) with minimal memory footprint.
- **Pure Node.js**: No Python or external image processing scripts required.
- **High Performance**: Uses gRPC protocol for low-latency communication and efficient binary serialization (FlatBuffers).
- **Secure**: Full support for SSL/TLS with integrated Draw Things Root CA.
- **Fast Generation**: Optimized for "Turbo" models (e.g., SDXL Turbo, Flux) with real-time progress updates.

## 🛠️ Prerequisites

- **macOS**: Draw Things is a macOS-native application.
- **Draw Things App**: Installed with models downloaded.
- **Node.js**: Version 16 or higher.
- **CRITICAL SETTING**: In Draw Things settings, **DISABLE "Response Compression"** (also known as FPY). This script does not support FPY compressed tensors.

## 📦 Installation

Clone this repository into your OpenClaw skills directory:

```bash
cd ~/.openclaw/skills
git clone https://github.com/mijuu/openclaw-skill-drawthings.git drawthings
cd drawthings
npm install
# Optional: Link the CLI globally
npm link
```

## ⚙️ Configuration

The skill uses a centralized configuration system stored in `~/.drawthings-skill/config.json`.

1. **Automatic Detection**: The skill automatically finds your Draw Things models if they are in the standard macOS location.
2. **Manual Setup**: Run the doctor command to check your setup:
   ```bash
   dt-skill doctor
   ```
3. **Configure Paths**: If needed, set your gRPC server path:
   ```bash
   dt-skill config --server-path "/path/to/gRPCServerCLI-macOS"
   ```

## 🚀 Usage

### 1. Start the Server

#### Option A: Use Draw Things App (Easiest)
1. Open **Draw Things** on your Mac.
2. Go to **Settings** and enable **gRPC Server**.

#### Option B: Use CLI (Headless)
```bash
dt-skill server start
```

### 2. Generate Images

```bash
# Basic generation
dt-skill gen --prompt "a serene mountain lake at sunrise" --output landscape.png

# Advanced usage (Turbo model, 2x upscale)
dt-skill gen --prompt "cyberpunk city" --model z_image_turbo_1.0_q6p.ckpt --steps 8 --upscale 2
```

### 3. Utility Commands

```bash
# Check server health
dt-skill server status

# List available models
dt-skill models

# Run diagnostics
dt-skill doctor
```

## 📂 Project Structure

- `scripts/cli.js`: Main entry point for `dt-skill`.
- `scripts/generate.js`: Core generation logic.
- `scripts/setup.js`: Configuration management.
- `scripts/imageService.proto`: gRPC service definitions.
- `references/`: Detailed documentation on gRPC protocols and samplers.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
