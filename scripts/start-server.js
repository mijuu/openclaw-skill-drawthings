#!/usr/bin/env node

/**
 * Wrapper script to start Draw Things gRPC server with configured paths.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const serverPath = config.get('DRAWTHINGS_SERVER_PATH');
const modelsPath = config.get('DRAWTHINGS_MODELS_PATH');
const addrStr = config.get('DRAWTHINGS_SERVER_ADDR') || '127.0.0.1:7859';
const addr = addrStr.split(':');
const useTls = config.get('DRAWTHINGS_USE_TLS') !== false;

if (!serverPath || !modelsPath) {
    console.error('Error: DRAWTHINGS_SERVER_PATH or DRAWTHINGS_MODELS_PATH not configured.');
    console.log('Please run "dt-skill doctor" for detailed configuration instructions.');
    process.exit(1);
}

const finalServerPath = serverPath.replace(/^~/, process.env.HOME || '');
const finalModelsPath = modelsPath.replace(/^~/, process.env.HOME || '');

if (!fs.existsSync(finalServerPath)) {
    console.error(`Error: Draw Things server binary NOT FOUND at: ${finalServerPath}`);
    console.log('Please verify your path or run "dt-skill doctor"');
    process.exit(1);
}

if (!fs.existsSync(finalModelsPath)) {
    console.error(`Error: Models directory NOT FOUND at: ${finalModelsPath}`);
    console.log('Please verify your path or run "dt-skill doctor"');
    process.exit(1);
}

const logFile = path.join(__dirname, '..', 'logs', 'server.log');
const logDir = path.dirname(logFile);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Open log file in append mode
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

const log = (msg) => {
    const timestamp = new Date().toLocaleString();
    const formattedMsg = `[${timestamp}] ${msg}\n`;
    process.stdout.write(formattedMsg);
    fs.writeSync(out, formattedMsg);
};

log(`Starting Draw Things server: ${finalServerPath}`);
log(`Models path: ${finalModelsPath}`);
log(`Address: ${addrStr}`);
log(`TLS Enabled: ${useTls}`);

const args = [
    '--model-browser',
    '--no-response-compression',
    '--address', addr[0] || '127.0.0.1',
    finalModelsPath
];

if (!useTls) {
    log('Adding --no-tls flag (Insecure mode)');
    args.push('--no-tls');
} else {
    log('Server starting in TLS mode (default)');
}

const server = spawn(finalServerPath, args, { 
    stdio: ['ignore', out, err],
    detached: true 
});

server.unref();

// Write PID to a file for tracking
const pidFile = path.join(__dirname, '..', '.server.pid');
fs.writeFileSync(pidFile, server.pid.toString());

log(`Server spawned with PID: ${server.pid}. Verification in 5s...`);

// Wait a few seconds to see if it crashes immediately
setTimeout(() => {
    try {
        process.kill(server.pid, 0);
        log('Server process is still running.');
        process.exit(0);
    } catch (e) {
        log('Server process failed to start or crashed immediately. Check logs.');
        process.exit(1);
    }
}, 5000);
