#!/usr/bin/env node

const config = require('./config');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');

program
    .option('--server-path <path>', 'Path to the Draw Things gRPC server binary')
    .option('--models-path <path>', 'Path to the directory containing models')
    .option('--addr <host:port>', 'Server address (e.g. 127.0.0.1:7859)')
    .option('--tls <boolean>', 'Enable/Disable TLS (true/false)')
    .option('--show', 'Show current configuration')
    .parse(process.argv);

const options = program.opts();

if (Object.keys(options).length === 0) {
    program.help();
}

if (options.show) {
    console.log('Current Configuration:');
    console.log(JSON.stringify(config.all(), null, 2));
    process.exit(0);
}

// Update config from options
let updated = false;

if (options.serverPath) {
    config.set('DRAWTHINGS_SERVER_PATH', options.serverPath);
    updated = true;
}
if (options.modelsPath) {
    config.set('DRAWTHINGS_MODELS_PATH', options.modelsPath);
    updated = true;
}
if (options.addr) {
    config.set('DRAWTHINGS_SERVER_ADDR', options.addr);
    updated = true;
}
if (options.tls) {
    config.set('DRAWTHINGS_USE_TLS', options.tls === 'true');
    updated = true;
}

if (updated) {
    console.log('Configuration updated and saved to ~/.drawthings-skill/config.json');
} else {
    console.log('No updates provided. Use --help to see available options.');
}
