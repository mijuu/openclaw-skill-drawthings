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
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const flatbuffers = require('flatbuffers');
const { PNG } = require('pngjs');
const { program } = require('commander');

// VTable slot indices for gRPC
const slots = {
    id: 0, start_width: 1, start_height: 2, seed: 3, steps: 4, guidance_scale: 5, strength: 6, model: 7, sampler: 8,
    batch_count: 9, batch_size: 10
};

const samplerNames = {
    "dpmpp2m-karras": 0, "euler-a": 1, "ddim": 2, "plms": 3, "dpmpp-sde-karras": 4, "unicpc": 5, "lcm": 6,
    "euler-a-substep": 7, "dpmpp-sde-substep": 8, "tcd": 9, "euler-a-trailing": 10, "dpmpp-sde-trailing": 11,
    "dpmpp2m-ays": 12, "euler-a-ays": 13, "dpmpp-sde-ays": 14, "dpmpp2m-trailing": 15, "ddim-trailing": 16,
    "unicpc-trailing": 17, "unicpc-ays": 18, "tcd-trailing": 19
};

function buildGenerationConfig(model, width, height, steps, seed, guidanceScale, sampler) {
    const builder = new flatbuffers.Builder(1024);
    const modelOff = builder.createString(model);
    builder.startObject(86);
    builder.addFieldInt64(slots.id, BigInt(0), BigInt(0));
    builder.addFieldInt16(slots.start_width, width / 64, 0);
    builder.addFieldInt16(slots.start_height, height / 64, 0);
    builder.addFieldInt32(slots.seed, seed, 0);
    builder.addFieldInt32(slots.steps, steps, 0);
    builder.addFieldFloat32(slots.guidance_scale, guidanceScale, 0);
    builder.addFieldFloat32(slots.strength, 1.0, 0);
    builder.addFieldOffset(slots.model, modelOff, 0);
    builder.addFieldInt8(slots.sampler, sampler, 0);
    const cfg = builder.endObject();
    builder.finish(cfg);
    return Buffer.from(builder.asUint8Array());
}

function decodeFloat16(h) {
    const s = (h >> 15) & 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) { if (f === 0) return s ? -0 : 0; let ee = e, ff = f; while ((ff & 0x400) === 0) { ff <<= 1; ee--; } ee++; ff &= 0x3ff; return 0; }
    if (e === 0x1f) return f === 0 ? (s ? -Infinity : Infinity) : NaN;
    const bits = (s << 31) | ((e + 112) << 23) | (f << 13);
    const buf = Buffer.alloc(4); buf.writeUInt32BE(bits >>> 0, 0); return buf.readFloatBE(0);
}

function tensorToPng(data, outPath) {
    // Basic tensor header check (simple heuristic for Draw Things)
    if (data.length < 68) {
        // Not a full tensor, maybe it's just raw PNG?
        if (data[0] === 0x89 && data[1] === 0x50) {
            fs.writeFileSync(outPath, data);
            return;
        }
        throw new Error(`Data too short to be a tensor: ${data.length} bytes`);
    }

    const h = data.readUInt32LE(24), w = data.readUInt32LE(28), c = data.readUInt32LE(32);
    const pixelData = data.slice(68);
    
    // Check if pixel data size matches dimensions (assuming float16)
    if (pixelData.length !== w * h * c * 2) {
         // Fallback: If it starts with PNG signature, save it directly
         if (data[0] === 0x89 && data[1] === 0x50) {
            fs.writeFileSync(outPath, data);
            return;
        }
        throw new Error(`Pixel data size mismatch: expected ${w * h * c * 2}, got ${pixelData.length}`);
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
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    console.log(`Generating via HTTP: "${options.prompt}"...`);
    return new Promise((resolve, reject) => {
        const req = http.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP Error: ${res.statusCode} - ${data}`));
                    return;
                }
                const response = JSON.parse(data);
                if (response.images && response.images.length > 0) {
                    const base64Data = response.images[0].replace(/^data:image\/png;base64,/, "");
                    fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
                    resolve(outPath);
                } else {
                    reject(new Error("No image data in HTTP response"));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function runGrpc(options, seed, outPath) {
    const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'imageService.proto'), { 
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    });
    const drawthings = grpc.loadPackageDefinition(packageDefinition);
    
    // Support SSL/TLS
    let credentials;
    let clientOptions = {
        'grpc.max_receive_message_length': -1,
        'grpc.max_send_message_length': -1
    };

    if (options.tls) {
        const caCert = fs.readFileSync(path.join(__dirname, 'drawthings-ca.pem'));
        credentials = grpc.credentials.createSsl(caCert);
        clientOptions['grpc.ssl_target_name_override'] = 'localhost';
        clientOptions['grpc.default_authority'] = 'localhost';
    } else {
        credentials = grpc.credentials.createInsecure();
    }

    const client = new drawthings.ImageGenerationService(options.addr, credentials, clientOptions);

    const samplerVal = samplerNames[options.sampler];
    const config = buildGenerationConfig(options.model, parseInt(options.width), parseInt(options.height), parseInt(options.steps), seed, parseFloat(options.guidance), samplerVal);

    const request = {
        prompt: options.prompt,
        negativePrompt: options.negativePrompt,
        configuration: config,
        scaleFactor: 1, // Changed to integer
        chunked: true,
        device: "LAPTOP",
        user: "OpenClaw"
    };

    console.log(`Generating via gRPC: "${options.prompt}"...`);
    return new Promise((resolve, reject) => {
        const call = client.GenerateImage(request);
        let chunks = Buffer.alloc(0);
        
        call.on('data', (response) => {
            if (response.currentSignpost) {
                const signpost = response.currentSignpost;
                if (signpost.sampling) {
                    console.log(`Sampling step: ${signpost.sampling.step}`);
                } else if (signpost.imageDecoded) {
                    console.log(`Image decoded`);
                } else if (signpost.textEncoded) {
                    console.log(`Text encoded`);
                }
            }

            if (response.generatedImages) {
                for (const img of response.generatedImages) {
                    if (img.length > 0) {
                        chunks = Buffer.concat([chunks, img]);
                    }
                }
            }
        });

        call.on('error', (err) => {
            reject(new Error(`gRPC Error: ${err.message}`));
        });

        call.on('end', () => {
            if (chunks.length === 0) {
                reject(new Error("No image received via gRPC"));
                return;
            }
            try {
                tensorToPng(chunks, outPath);
                resolve(outPath);
            } catch (e) {
                reject(e);
            }
        });
    });
}

program
    .option('--prompt <text>', 'Prompt', 'a cat')
    .option('--negative-prompt <text>', 'Negative prompt', '')
    .option('--width <px>', 'Width', '512')
    .option('--height <px>', 'Height', '512')
    .option('--steps <n>', 'Steps', '8')
    .option('--seed <n>', 'Seed', '0')
    .option('--guidance <f>', 'Guidance', '1.0')
    .option('--sampler <name>', 'Sampler', 'unicpc-trailing')
    .option('--model <filename>', 'Model', 'z_image_turbo_1.0_q6p.ckpt')
    .option('--output <path>', 'Output path')
    .option('--addr <host:port>', 'Address')
    .option('--http', 'Force HTTP protocol (Port 7860)')
    .option('--grpc', 'Force gRPC protocol (Port 7859)')
    .option('--tls', 'Enable SSL/TLS for gRPC')
    .option('--health', 'Check server health')
    .option('--list-models', 'List available models')
    .parse(process.argv);

const options = program.opts();

async function main() {
    if (options.health || options.list_models) {
        const finalAddr = options.addr || '127.0.0.1:7859';
        const packageDefinition = protoLoader.loadSync(path.join(__dirname, 'imageService.proto'), { keepCase: true });
        const drawthings = grpc.loadPackageDefinition(packageDefinition);
        
        let credentials;
        let clientOptions = {
            'grpc.max_receive_message_length': -1,
            'grpc.max_send_message_length': -1
        };

        if (options.tls) {
            const caCert = fs.readFileSync(path.join(__dirname, 'drawthings-ca.pem'));
            credentials = grpc.credentials.createSsl(caCert);
            clientOptions['grpc.ssl_target_name_override'] = 'localhost';
            clientOptions['grpc.default_authority'] = 'localhost';
        } else {
            credentials = grpc.credentials.createInsecure();
        }

        const client = new drawthings.ImageGenerationService(finalAddr, credentials, clientOptions);
        
        client.Echo({ name: 'health-check' }, (err, response) => {
            if (err) {
                console.error(`Health check failed: ${err.message}`);
                process.exit(1);
            } else {
                if (options.list_models) {
                    console.log('Available models:');
                    response.files.forEach(f => console.log(`- ${f}`));
                } else {
                    console.log('Server is healthy:', response.message);
                }
                process.exit(0);
            }
        });
        return;
    }

    const seed = options.seed === '0' ? Math.floor(Math.random() * 2**32) : parseInt(options.seed);
    
    // Default to ./outputs/ directory in CWD
    const outputDir = path.resolve(process.cwd(), 'outputs');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const rawOutPath = options.output || path.join(outputDir, `output_${Date.now()}.png`);
    const outPath = path.resolve(rawOutPath);

    // Ensure parent directory of output file exists if user provided custom path
    const parentDir = path.dirname(outPath);
    if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }

    // Auto-detect or force protocol
    let useHttp = options.http;
    if (!options.http && !options.grpc) {
        // Default logic: 7860 or "http" in addr implies HTTP
        useHttp = (options.addr && options.addr.includes('7860'));
    }

    const finalAddr = options.addr || (useHttp ? '127.0.0.1:7860' : '127.0.0.1:7859');
    options.addr = finalAddr;

    try {
        const result = useHttp ? await runHttp(options, seed, outPath) : await runGrpc(options, seed, outPath);
        console.log(`Image saved to: ${result}`);
        process.exit(0);
    } catch (err) {
        console.error(`Generation failed: ${err.message}`);
        process.exit(1);
    }
}

main();
