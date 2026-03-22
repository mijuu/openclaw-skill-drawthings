# OpenClaw 技能：Draw Things AI 图像生成

[English Version](README.md)

这是一个为 [OpenClaw](https://github.com/mijuu/openclaw) / Gemini CLI 开发的高性能 Node.js 技能，支持在 macOS 上通过 [Draw Things](https://drawthings.ai/) gRPC 后端进行本地 AI 图像生成。

## 🚀 核心特性

- **集中式 CLI**：强大的 `dt-skill` 命令，集成了生成、配置和服务器管理功能。
- **自动探测**：自动识别 macOS 上 Draw Things 的标准模型存储路径。
- **内存优化**：针对 4K/8K 大图传输进行了深度优化，内存占用极低。
- **纯 Node.js 实现**：无需 Python 或外部图像处理脚本。
- **高性能**：采用 gRPC 协议进行低延迟通信，并使用 FlatBuffers 进行高效的二进制序列化。
- **安全可靠**：全面支持 SSL/TLS 加密，并内置了 Draw Things 根证书（Root CA）。
- **快速生成**：针对 "Turbo" 模型（如 SDXL Turbo, Flux）进行了优化，支持实时生成进度更新。

## 🛠️ 前置条件

- **macOS**：Draw Things 是一款 macOS 原生应用。
- **Draw Things App**：已安装并下载了所需的模型。
- **Node.js**：版本 16 或更高。
- **重要设置**：在 Draw Things 的设置中，**禁用 "Response Compression" (响应压缩)** (也称为 FPY)。该脚本目前不支持 FPY 压缩的张量。

## 📦 安装

将此仓库克隆到你的 OpenClaw 技能目录中：

```bash
cd ~/.openclaw/skills
git clone https://github.com/mijuu/openclaw-skill-drawthings.git drawthings
cd drawthings
npm install
# 可选：将 CLI 链接到全局
npm link
```

## ⚙️ 配置

该技能使用集中式配置系统，设置存储在 `~/.drawthings-skill/config.json` 中。

1. **自动探测**：如果你的模型在标准 macOS 沙盒路径中，技能会自动找到它们。
2. **诊断检查**：运行诊断命令查看你的环境状态：
   ```bash
   dt-skill doctor
   ```
3. **手动配置**：如果需要，可以手动设置 gRPC 服务器路径：
   ```bash
   dt-skill config --server-path "/你的/路径/gRPCServerCLI-macOS"
   ```

## 🚀 使用方法

### 1. 启动服务器

#### 方式 A：直接使用 Draw Things App（最简单）
1. 在你的 Mac 上打开 **Draw Things** 应用。
2. 进入 **Settings (设置)** 并开启 **gRPC Server**。

#### 方式 B：使用命令行（后台运行）
```bash
dt-skill server start
```

### 2. 生成图像

```bash
# 基础生成
dt-skill gen --prompt "清晨宁静的山湖" --output landscape.png

# 进阶用法 (使用 Turbo 模型, 2倍放大)
dt-skill gen --prompt "赛博朋克城市" --model z_image_turbo_1.0_q6p.ckpt --steps 8 --upscale 2
```

### 3. 工具命令

```bash
# 检查服务器健康状态
dt-skill server status

# 列出可用模型
dt-skill models

# 运行诊断检查
dt-skill doctor
```

## 📂 项目结构

- `scripts/cli.js`：`dt-skill` 的主入口点。
- `scripts/generate.js`：核心生成逻辑。
- `scripts/setup.js`：配置管理逻辑。
- `scripts/imageService.proto`：gRPC 服务定义。
- `references/`：关于 gRPC 协议和采样器的详细文档。

## 🤝 贡献

欢迎提交贡献！请随时提交 Pull Request。

## 📜 许可证

MIT 许可证。详见 [LICENSE](LICENSE)。
