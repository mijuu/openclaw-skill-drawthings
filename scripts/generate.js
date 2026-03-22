#!/usr/bin/env node

/**
 * Draw Things Universal Image Generator (gRPC + HTTP)
 * 
 * Supports:
 * - gRPC (Port 7859) - High performance, binary configuration.
 * - HTTP (Port 7860) - High stability, WebUI API compatible.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

// Initialize logging
const logFile = path.join(__dirname, '..', 'logs', 'generate.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const log = (msg) => {
    const timestamp = new Date().toLocaleString();
    logStream.write(`[${timestamp}] ${msg}\n`);
};
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const flatbuffers = require('flatbuffers');
const { PNG } = require('pngjs');
const { program } = require('commander');
const config = require('./config');

// VTable slot indices for gRPC
const slots = {
    id: 0, start_width: 1, start_height: 2, seed: 3, steps: 4, guidance_scale: 5, strength: 6, model: 7, sampler: 8,
    batch_count: 9, batch_size: 10,
    upscaler: 15,
    loras: 20,
    refiner_model: 28,
    refiner_start: 38,
    upscaler_scale_factor: 63
};

const samplerNames = {
    "dpmpp2m-karras": 0, "euler-a": 1, "ddim": 2, "plms": 3, "dpmpp-sde-karras": 4, "unicpc": 5, "lcm": 6,
    "euler-a-substep": 7, "dpmpp-sde-substep": 8, "tcd": 9, "euler-a-trailing": 10, "dpmpp-sde-trailing": 11,
    "dpmpp2m-ays": 12, "euler-a-ays": 13, "dpmpp-sde-ays": 14, "dpmpp2m-trailing": 15, "ddim-trailing": 16,
    "unicpc-trailing": 17, "unicpc-ays": 18, "tcd-trailing": 19
};

function buildGenerationConfig(model, width, height, steps, seed, guidanceScale, sampler, upscaler = null, upscalerScaleFactor = 0, loras = [], refiner = null) {
    const builder = new flatbuffers.Builder(1024);
    const modelOff = builder.createString(model);
    const upscalerOff = upscaler ? builder.createString(upscaler) : null;
    const refinerModelOff = (refiner && refiner.model) ? builder.createString(refiner.model) : null;

    // Create LoRA objects if any
    let loraOffsets = [];
    if (loras && loras.length > 0) {
        loras.forEach(l => {
            const fileOff = builder.createString(l.file);
            builder.startObject(3);
            builder.addFieldOffset(0, fileOff, 0); // Slot 0: file
            builder.addFieldFloat32(1, l.weight || 1.0, 1.0); // Slot 1: weight
            builder.addFieldInt32(2, l.mode || 0, 0); // Slot 2: mode (0: Regular)
            loraOffsets.push(builder.endObject());
        });
    }
    const lorasVectorOff = loraOffsets.length > 0 ? builder.createVectorOfOffsets(loraOffsets) : null;

    builder.startObject(86);
    builder.addFieldInt64(slots.id, BigInt(0), BigInt(0));
    builder.addFieldInt16(slots.start_width, width / 64, 0);
    builder.addFieldInt16(slots.start_height, height / 64, 0);
    builder.addFieldInt32(slots.seed, seed, 0);
    builder.addFieldInt32(slots.steps, steps, 0);
    builder.addFieldFloat32(slots.guidance_scale, guidanceScale, 0.0);
    builder.addFieldFloat32(slots.strength, (options.strength !== undefined) ? parseFloat(options.strength) : 1.0, 0.0);
    builder.addFieldOffset(slots.model, modelOff, 0);
    builder.addFieldInt8(slots.sampler, sampler, 0);
    
    if (upscalerOff) {
        builder.addFieldOffset(slots.upscaler, upscalerOff, 0);
        builder.addFieldInt8(slots.upscaler_scale_factor, upscalerScaleFactor, 0);
    }

    if (lorasVectorOff) {
        builder.addFieldOffset(slots.loras, lorasVectorOff, 0);
    }

    if (refinerModelOff) {
        builder.addFieldOffset(slots.refiner_model, refinerModelOff, 0);
        builder.addFieldFloat32(slots.refiner_start, refiner.start || 0.7, 0.7);
    }

    const cfg = builder.endObject();
    builder.finish(cfg);
    return Buffer.from(builder.asUint8Array());
}

function encodeFloat16(f) {
    const floatView = new Float32Array(1);
    const int32View = new Uint32Array(floatView.buffer);
    floatView[0] = f;
    const x = int32View[0];
    const bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) return bits | 0x7c00 | (e === 255 ? (x & 0x007fffff) ? 0x0200 : 0 : 0);
    if (e < 113) {
        m |= 0x0800;
        return bits | (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    }
    return bits | ((e - 112) << 10) | (m >> 1) + (m & 1);
}

function pngToTensor(pngPath) {
    const data = fs.readFileSync(pngPath);
    const png = PNG.sync.read(data);
    const { width, height } = png;
    const channels = 3; // RGB
    
    // Header constants for Draw Things (ccv_nnc_tensor_param_t)
    const CCV_TENSOR_CPU_MEMORY = 0x1;
    const CCV_TENSOR_FORMAT_NHWC = 0x02;
    const CCV_16F = 0x20000;

    const tensorBuffer = Buffer.alloc(68 + width * height * channels * 2);
    // Write header (9 unsigned ints of 4 bytes each = 36 bytes, plus padding up to 68)
    tensorBuffer.writeUInt32LE(0, 0); // auto
    tensorBuffer.writeUInt32LE(CCV_TENSOR_CPU_MEMORY, 4);
    tensorBuffer.writeUInt32LE(CCV_TENSOR_FORMAT_NHWC, 8);
    tensorBuffer.writeUInt32LE(CCV_16F, 12);
    tensorBuffer.writeUInt32LE(0, 16); // reserved
    tensorBuffer.writeUInt32LE(1, 20); // N (batch size)
    tensorBuffer.writeUInt32LE(height, 24);
    tensorBuffer.writeUInt32LE(width, 28);
    tensorBuffer.writeUInt32LE(channels, 32);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pngIdx = (y * width + x) * 4;
            const tensorIdx = 68 + (y * width + x) * (channels * 2);
            for (let c = 0; c < channels; c++) {
                const v = (png.data[pngIdx + c] / 255) * 2 - 1; // Normalize to -1..1
                tensorBuffer.writeUInt16LE(encodeFloat16(v), tensorIdx + c * 2);
            }
        }
    }
    return tensorBuffer;
}
function decodeFloat16(h) {
    const s = (h >> 15) & 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) { if (f === 0) return s ? -0 : 0; let ee = e, ff = f; while ((ff & 0x400) === 0) { ff <<= 1; ee--; } ee++; ff &= 0x3ff; return 0; }
    if (e === 0x1f) return f === 0 ? (s ? -Infinity : Infinity) : NaN;
    const bits = (s << 31) | ((e + 112) << 23) | (f << 13);
    const buf = Buffer.alloc(4); buf.writeUInt32BE(bits >>> 0, 0); return buf.readFloatBE(0);
}

function tensorToPng(data, outPath) {
    // 1. Check for FPY magic bytes
    if (data[0] === 0x66 && data[1] === 0x70 && data[2] === 0x79 && data[3] === 0x29) {
        throw new Error("Received FPY compressed tensor. Please DISABLE 'Response Compression' in Draw Things server settings.");
    }
    // 2. Full Buffer Decompression (zlib 0x78, gzip 0x1f 0x8b)
    if (data[0] === 0x78 || (data[0] === 0x1f && data[1] === 0x8b)) {
        try {
            data = data[0] === 0x1f ? zlib.gunzipSync(data) : zlib.inflateSync(data);
        } catch (e) {}
    }
    // 3. Direct PNG Check
    if (data[0] === 0x89 && data[1] === 0x50) {
        fs.writeFileSync(outPath, data);
        return;
    }
    // 4. Tensor Header Check
    if (data.length < 68) {
        throw new Error(`Data too short: ${data.length} bytes.`);
    }
    const h = data.readUInt32LE(24), w = data.readUInt32LE(28), c = data.readUInt32LE(32);
    let pixelData = data.slice(68);
    // 5. Raw Pixel Processing (Float16)
    const expectedSize = w * h * c * 2;
    if (pixelData.length !== expectedSize) {
        throw new Error(`Pixel data size mismatch. Ensure 'Response Compression' is DISABLED in Draw Things.`);
    }
    const png = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * c * 2, pngIdx = (y * w + x) * 4;
            const clamp = (v) => Math.max(0, Math.min(255, Math.round(((v + 1) / 2) * 255)));
            png.data[pngIdx] = clamp(decodeFloat16(pixelData.readUInt16LE(idx)));
            png.data[pngIdx + 1] = clamp(decodeFloat16(pixelData.readUInt16LE(idx + 2)));
            png.data[pngIdx + 2] = clamp(decodeFloat16(pixelData.readUInt16LE(idx + 4)));
            png.data[pngIdx + 3] = 255;
        }
    }
    fs.writeFileSync(outPath, PNG.sync.write(png));
}

async function runHttp(options, seed, outPath) {
    const payload = JSON.stringify({
        prompt: options.prompt,
        negative_prompt: options.negativePrompt,
        steps: parseInt(options.steps),
        seed: seed,
        cfg_scale: parseFloat(options.guidance),
        width: parseInt(options.width),
        height: parseInt(options.height),
        sampler_name: options.sampler,
        override_settings: { model: options.model }
    });
    const [host, port] = options.addr.split(':');
    const requestOptions = {
        hostname: host || '127.0.0.1',
        port: port || 7860,
        path: '/sdapi/v1/txt2img',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    console.log(`Generating via HTTP: "${options.prompt}"...`);
    return new Promise((resolve, reject) => {
        const req = http.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) { reject(new Error(`HTTP Error: ${res.statusCode} - ${data}`)); return; }
                const response = JSON.parse(data);
                if (response.images && response.images.length > 0) {
                    const base64Data = response.images[0].replace(/^data:image\/png;base64,/, "");
                    fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
                    resolve(outPath);
                } else { reject(new Error("No image data in HTTP response")); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function runGrpc(options, seed, outPath) {
    const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'imageService.proto'), { 
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
    });
    const drawthings = grpc.loadPackageDefinition(packageDefinition);
    
    // Auto-detect TLS from config or options, default to true unless false
    const finalTls = options.tls || (config.get('DRAWTHINGS_USE_TLS') !== false);
    
    let credentials;
    let clientOptions = {
        'grpc.max_receive_message_length': -1,
        'grpc.max_send_message_length': -1,
        'grpc.keepalive_time_ms': 5000,
        'grpc.keepalive_timeout_ms': 2000,
        'grpc.keepalive_permit_without_calls': 1
    };

    if (finalTls) {
        const caCert = fs.readFileSync(path.join(__dirname, 'drawthings-ca.pem'));
        credentials = grpc.credentials.createSsl(caCert);
        clientOptions['grpc.ssl_target_name_override'] = 'localhost';
        clientOptions['grpc.default_authority'] = 'localhost';
    } else {
        credentials = grpc.credentials.createInsecure();
    }

    const client = new drawthings.ImageGenerationService(options.addr, credentials, clientOptions);

    // --- Readiness Check ---
    if (options.wait) {
        process.stdout.write(`Waiting for server at ${options.addr} (${finalTls ? 'TLS' : 'Insecure'})...`);
        const startTime = Date.now();
        const timeout = parseInt(options.waitTimeout) * 1000;
        let ready = false;
        while (!ready && Date.now() - startTime < timeout) {
            try {
                await new Promise((resolve, reject) => {
                    const deadline = Date.now() + 1500;
                    client.Echo({ name: 'readiness-check' }, { deadline }, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                ready = true;
                process.stdout.write(" Ready!\n");
            } catch (e) {
                process.stdout.write(".");
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        if (!ready) throw new Error(`Server connection timed out after ${options.waitTimeout}s. Check if server TLS setting matches client.`);
    }

    const samplerVal = samplerNames[options.sampler];
    const upscaleFactor = parseInt(options.upscale || 1);
    const upscalerFile = upscaleFactor > 1 ? (options.upscaler || 'realesrgan_x4plus_f16.ckpt') : null;

    // Parse LoRAs: --lora "name:weight"
    const loras = [];
    if (options.lora) {
        const loraArgs = Array.isArray(options.lora) ? options.lora : [options.lora];
        loraArgs.forEach(arg => {
            const [file, weight] = arg.split(':');
            loras.push({ file, weight: parseFloat(weight || 1.0), mode: 0 });
        });
    }

    let inputImageTensor = null;
    let finalWidth = parseInt(options.width);
    let finalHeight = parseInt(options.height);

    if (options.image) {
        if (!fs.existsSync(options.image)) {
            throw new Error(`Input image not found: ${options.image}`);
        }
        console.log(`Loading input image: ${options.image}`);
        inputImageTensor = pngToTensor(options.image);
        // Extract width/height from tensor header if not explicitly set
        if (!options.width || options.width === '1024') finalWidth = inputImageTensor.readUInt32LE(28);
        if (!options.height || options.height === '576') finalHeight = inputImageTensor.readUInt32LE(24);
        console.log(`Using input resolution: ${finalWidth}x${finalHeight}`);
    }

    const generationConfig = buildGenerationConfig(
        options.model, 
        finalWidth, 
        finalHeight, 
        parseInt(options.steps), 
        seed, 
        parseFloat(options.guidance), 
        samplerVal,
        upscalerFile,
        upscaleFactor > 1 ? upscaleFactor : 0,
        loras,
        options.refinerModel ? { model: options.refinerModel, start: parseFloat(options.refinerStart || 0.7) } : null
    );

    const request = {
        prompt: options.prompt, 
        negativePrompt: options.negativePrompt, 
        configuration: generationConfig,
        scaleFactor: upscaleFactor, 
        chunked: true, 
        device: "LAPTOP", 
        user: "OpenClaw",
        image: inputImageTensor
    };

    if (upscaleFactor > 1) {
        console.log(`Upscaling enabled: ${upscaleFactor}x using ${upscalerFile}`);
    }
    if (loras.length > 0) {
        console.log(`LoRAs enabled: ${loras.map(l => `${l.file} (${l.weight})`).join(', ')}`);
    }
    if (options.refinerModel) {
        console.log(`Refiner enabled: ${options.refinerModel} starting at ${options.refinerStart || 0.7}`);
    }

    console.log(`Generating via gRPC: "${options.prompt}"...`);
    const startTime = Date.now();
    let firstStepTime = null;

    return new Promise((resolve, reject) => {
        const call = client.GenerateImage(request);
        let chunks = Buffer.alloc(0);
        call.on('data', (response) => {
            if (response.scaleFactor) console.log(`Response Scale Factor: ${response.scaleFactor}`);
            if (response.currentSignpost) {
                const signpost = response.currentSignpost;
                if (signpost.sampling) {
                    if (firstStepTime === null && signpost.sampling.step > 0) firstStepTime = Date.now();
                    let etaStr = '';
                    if (firstStepTime && signpost.sampling.step > 0) {
                        const elapsed = Date.now() - firstStepTime;
                        const avgTime = elapsed / signpost.sampling.step;
                        const remaining = options.steps - signpost.sampling.step;
                        const etaSec = Math.round((avgTime * remaining) / 1000);
                        if (etaSec >= 0) etaStr = ` (ETA: ${etaSec}s)`;
                    }
                    process.stdout.write(`\rSampling step: ${signpost.sampling.step}/${options.steps}${etaStr}...`);
                } else if (signpost.imageDecoded) {
                    process.stdout.write(`\nImage decoded (Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`);
                } else if (signpost.imageUpscaled) {
                    process.stdout.write(`Image upscaled!\n`);
                }
            }
            if (response.generatedImages) {
                for (const img of response.generatedImages) if (img.length > 0) chunks = Buffer.concat([chunks, img]);
            }
        });
        call.on('error', (err) => reject(new Error(`gRPC Error: ${err.message}`)));
        call.on('end', () => {
            if (chunks.length === 0) { reject(new Error("No image received")); return; }
            try { tensorToPng(chunks, outPath); resolve(outPath); } catch (e) { reject(e); }
        });
    });
}

program
    .option('--prompt <text>', 'Prompt')
    .option('--negative-prompt <text>', 'Negative Prompt', '')
    .option('--width <n>', 'Width', '1024')
    .option('--height <n>', 'Height', '576')
    .option('--steps <n>', 'Steps', '8')
    .option('--seed <n>', 'Seed (0 for random)', '0')
    .option('--guidance <f>', 'Guidance', '1.0')
    .option('--sampler <name>', 'Sampler', 'unicpc-trailing')
    .option('--model <filename>', 'Model', 'z_image_turbo_1.0_q6p.ckpt')
    .option('--lora <name:weight>', 'Add LoRA (e.g. style:0.8). Can be used multiple times.', (val, memo) => { memo.push(val); return memo; }, [])
    .option('--refiner-model <filename>', 'Refiner model filename')
    .option('--refiner-start <f>', 'Refiner start percentage (0.0 - 1.0)', '0.7')
    .option('--image <path>', 'Input image for Img2Img')
    .option('--strength <f>', 'Denoising strength (0.0 - 1.0)', '0.7')
    .option('--upscale <factor>', 'Upscale factor (e.g. 2, 4)', '1')
    .option('--upscaler <filename>', 'Upscaler model filename', 'realesrgan_x4plus_f16.ckpt')
    .option('--output <path>', 'Output path')
    .option('--addr <host:port>', 'Address')
    .option('--http', 'Force HTTP')
    .option('--grpc', 'Force gRPC')
    .option('--tls', 'Enable TLS')
    .option('--wait', 'Wait for server', true)
    .option('--wait-timeout <sec>', 'Max wait', '60')
    .option('--health', 'Check health')
    .option('--list-models', 'List models')
    .parse(process.argv);

const options = program.opts();

async function main() {
    // Show help if no prompt and not checking health or listing models
    if (!options.prompt && !options.health && !options.listModels) {
        program.help();
    }

    console.log('DEBUG OPTIONS:', options);
    const finalAddr = options.addr || config.get('DRAWTHINGS_SERVER_ADDR') || '127.0.0.1:7859';
    options.addr = finalAddr;

    // --- Truncation Check ---
    if (options.prompt && (options.prompt.endsWith('...') || options.prompt.endsWith('…'))) {
        console.error(`ERROR: The prompt appears to be truncated ("${options.prompt}").`);
        console.error("AI: You MUST provide the FULL prompt text. DO NOT use ellipses or abbreviations.");
        process.exit(1);
    }

    if (options.health || options.listModels) {
        const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'imageService.proto'), { keepCase: true });
        const drawthings = grpc.loadPackageDefinition(packageDefinition);
        const finalTls = options.tls || (config.get('DRAWTHINGS_USE_TLS') !== false);
        let credentials = finalTls ? grpc.credentials.createSsl(fs.readFileSync(path.join(__dirname, 'drawthings-ca.pem'))) : grpc.credentials.createInsecure();
        const client = new drawthings.ImageGenerationService(finalAddr, credentials);
        
        try {
            const response = await new Promise((resolve, reject) => {
                const echoName = 'health-check'; 
                client.Echo({ name: echoName }, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            // 1. Decode Overrides (Used by both health and listModels)
            const readableOverride = {};
            if (response.override) {
                for (const [key, value] of Object.entries(response.override)) {
                    if (Buffer.isBuffer(value)) {
                        const str = value.toString('utf8');
                        try { readableOverride[key] = JSON.parse(str); }
                        catch (e) { readableOverride[key] = str; }
                    } else {
                        readableOverride[key] = value;
                    }
                }
            }

            if (options.listModels) {
                const upscalerKeywords = ['upscale', 'realesrgan', 'esrgan', 'hat', 'swin', 'swinir', 'nmkd', '4x', '2x'];
                const upscalers = [];
                const models = [];
                const others = [];

                // Extract from metadata (Active Models)
                if (readableOverride.models && Array.isArray(readableOverride.models)) {
                    readableOverride.models.forEach(m => models.push(m.name ? `${m.name} (${m.file})` : (m.file || m)));
                }
                if (readableOverride.upscalers && Array.isArray(readableOverride.upscalers)) {
                    readableOverride.upscalers.forEach(u => upscalers.push(u.name ? `${u.name} (${u.file})` : (u.file || u)));
                }

                // Extract from file list (Raw Files)
                if (response.files) {
                    response.files.forEach(f => {
                        const fl = f.toLowerCase();
                        if (upscalerKeywords.some(kw => fl.includes(kw))) {
                            if (!upscalers.some(u => u.includes(f))) upscalers.push(f);
                        } else if (fl.endsWith('.ckpt') || fl.endsWith('.safetensors')) {
                            if (!models.some(m => m.includes(f))) models.push(f);
                        } else {
                            others.push(f);
                        }
                    });
                }

                console.log('--- Available Models ---');
                if (models.length > 0) {
                    models.sort().forEach(m => console.log(`[Model] ${m}`));
                } else {
                    console.log('(No models found)');
                }

                console.log('\n--- Detected Upscaler Models ---');
                if (upscalers.length > 0) {
                    upscalers.sort().forEach(u => console.log(`[Upscaler] ${u}`));
                } else {
                    console.log('(No specific upscaler models found)');
                }

                if (others.length > 0) {
                    console.log('\n--- Other Files ---');
                    others.sort().slice(0, 50).forEach(f => console.log(`- ${f}`));
                    if (others.length > 50) console.log(`... and ${others.length - 50} more files.`);
                }
            } else {
                console.log('Server is healthy:', response.message);
                if (Object.keys(readableOverride).length > 0) {
                    console.log('Server Overrides:', JSON.stringify(readableOverride, null, 2));
                }
            }
            process.exit(0);
        } catch (err) {
            console.error(`Health check failed (${finalTls ? 'TLS' : 'Insecure'}): ${err.message}`);
            process.exit(1);
        }
        return; // Ensure we don't fall through to generation
    }

    const seed = options.seed === '0' ? Math.floor(Math.random() * 2**32) : parseInt(options.seed);
    const outputDir = path.resolve(process.cwd(), 'outputs');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const outPath = path.resolve(options.output || path.join(outputDir, `output_${Date.now()}.png`));
    if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });

    let useHttp = options.http || (!options.grpc && finalAddr.includes('7860'));
    options.addr = finalAddr;

    try {
        log(`Generating image - Prompt: "${options.prompt}", Steps: ${options.steps}, Seed: ${seed}, Model: ${options.model}`);
        const result = await (useHttp ? runHttp(options, seed, outPath) : runGrpc(options, seed, outPath));
        console.log(`Image saved to: ${result}`);
        log(`Success: Image saved to ${result}`);
        process.exit(0);
    } catch (err) {
        console.error(`Generation failed: ${err.message}`);
        log(`Error: Generation failed - ${err.message}`);
        process.exit(1);
    }
}

main();
