# Gemini Project Context: Draw Things Skill
## Project Overview

-   **Purpose**: Local AI image generation using the Draw Things gRPC backend.
-   **Architecture**: A **Client-Server** model.
    -   **Control Layer (Inside Skill)**: Pure Node.js implementation using `@grpc/grpc-js` and `pngjs`.
    -   **Infrastructure Layer (External)**: The Draw Things macOS binary and ~10GB of model weights, managed outside this repository.
-   **Core Technologies**:
    -   **Language**: Node.js.
    -   **Communication**: gRPC (`imageService.proto`).
    -   **Configuration**: FlatBuffers binary.
    -   **Backend**: Draw Things (External macOS binary).

## External Infrastructure

This skill controls an external server. **Do not move or copy** these heavy assets into the skill directory.

-   **Server Binary**: `[Path to your Draw Things gRPC server binary, e.g., /path/to/gRPCServerCLI-macOS]`
-   **Models Directory**: `[Path to your Draw Things models, e.g., ~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models]`
-   **Default Address**: `127.0.0.1:7859` (No TLS, no compression).

## Current Status: Pure Node.js Implementation

✅ **Pure Node.js**: High-performance gRPC implementation using `@grpc/grpc-js` and `pngjs`. No external dependencies other than the Draw Things server.
⚠️ **Note**: Ensure the server binary version is compatible with the `GenerateImage` method. Refer to `IMPLEMENTATION.md` for troubleshooting.

## Configuration

The Draw Things skill uses a centralized configuration system. Settings are stored in `~/.drawthings-skill/config.json`.

### 1. Initial Setup
Run the setup command to configure your local paths:
```bash
# Using global command (if linked)
dt-skill config --server-path "/path/to/gRPCServerCLI-macOS" --models-path "~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models"

# Or using npm
npm run dt -- config --server-path "/path/to/..."
```

### 2. View Configuration
```bash
dt-skill config --show
```

### 3. Server Control
```bash
dt-skill server start
dt-skill server status
dt-skill server stop
```

### 4. Generate Images
```bash
dt-skill gen --prompt "a serene mountain lake at sunrise" --output output.png
```

## Key Commands

| Command | Description |
| :--- | :--- |
| `npm run start-server` | Starts the Draw Things gRPC server on `127.0.0.1:7859`. |
| `npm run generate -- [options]` | Generates an image using `scripts/generate.js`. |
| `npm run health` | Checks if the gRPC server is responsive. |
| `npm run models` | Placeholder (model listing depends on local filesystem access). |

## Project Structure

-   `scripts/generate.js`: Core logic for gRPC communication, FlatBuffer building, and image saving.
-   `scripts/imageService.proto`: gRPC service and message definitions.
-   `references/`: Detailed documentation on gRPC protocols and sampler algorithms.
-   `SKILL.md`: User-facing documentation and quick start guide.
-   `IMPLEMENTATION.md`: Technical implementation details (FlatBuffer slots, tensor decoding).

## Development Conventions

-   **Pure Node.js**: All gRPC logic, binary serialization (FlatBuffers), and image decoding are handled in Node.js for maximum performance and portability.
-   **Error Handling**: Detailed status codes and troubleshooting tables are maintained in the documentation.
-   **Model Management**: Default models are optimized for speed (e.g., `z_image_turbo`).
-   **Sampler Selection**: Recommended samplers include `unicpc-trailing` and `euler-a-trailing`.
