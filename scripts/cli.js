#!/usr/bin/env node

const { program } = require('commander');
const { spawnSync } = require('child_process');
const path = require('path');

program
  .name('dt-skill')
  .description('Draw Things AI Image Generation Skill CLI')
  .version('1.0.0');

// 子命令：生成图片
program
  .command('gen')
  .description('Generate an image from a text prompt')
  .option('--prompt <text>', 'Text prompt for image generation')
  .option('--negative-prompt <text>', 'Negative prompt to exclude elements', '')
  .option('--width <n>', 'Image width (default: 1024)', '1024')
  .option('--height <n>', 'Image height (default: 576)', '576')
  .option('--steps <n>', 'Number of sampling steps (default: 8)', '8')
  .option('--seed <n>', 'Random seed (0 for random, default: 0)', '0')
  .option('--guidance <f>', 'Guidance scale (default: 1.0)', '1.0')
  .option('--sampler <name>', 'Sampler name (default: unicpc-trailing)', 'unicpc-trailing')
  .option('--model <filename>', 'Model filename (default: z_image_turbo_1.0_q6p.ckpt)')
  .option('--lora <name:weight>', 'Add LoRA (e.g. style:0.8), can be used multiple times', (val, memo) => { memo.push(val); return memo; }, [])
  .option('--upscale <factor>', 'Upscale factor (e.g. 2, 4, default: 1)', '1')
  .option('--output <path>', 'Output image path')
  .option('--image <path>', 'Input image for Img2Img')
  .option('--strength <f>', 'Denoising strength for Img2Img (0.0-1.0, default: 0.7)', '0.7')
  .allowUnknownOption()
  .action((options, command) => {
    const args = process.argv.slice(process.argv.indexOf('gen') + 1);
    spawnSync('node', [path.join(__dirname, 'generate.js'), ...args], { stdio: 'inherit' });
  });

// 子命令：配置管理
program
  .command('config')
  .description('Manage skill configuration (server path, models, etc.)')
  .option('--server-path <path>', 'Path to the Draw Things gRPC server binary')
  .option('--models-path <path>', 'Path to the directory containing models')
  .option('--addr <host:port>', 'Server address (default: 127.0.0.1:7859)')
  .option('--tls <boolean>', 'Enable/Disable TLS (default: true)')
  .option('--show', 'Show current configuration')
  .allowUnknownOption()
  .action((options, command) => {
    const args = process.argv.slice(process.argv.indexOf('config') + 1);
    spawnSync('node', [path.join(__dirname, 'setup.js'), ...args], { stdio: 'inherit' });
  });

// 子命令：诊断检查
program
  .command('doctor')
  .description('Run diagnostics to verify paths and server status')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'doctor.js')], { stdio: 'inherit' });
  });

// 子命令：模型列表
program
  .command('models')
  .description('List all available models and upscalers on the server')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'generate.js'), '--list-models'], { stdio: 'inherit' });
  });

// 组命令：服务器管理
const server = program.command('server').description('Manage the Draw Things gRPC server process');

server
  .command('start')
  .description('Start the Draw Things gRPC server in background')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'start-server.js')], { stdio: 'inherit' });
  });

server
  .command('stop')
  .description('Stop the running Draw Things gRPC server')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'stop-server.js')], { stdio: 'inherit' });
  });

server
  .command('restart')
  .description('Restart the server to apply configuration changes')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'restart-server.js')], { stdio: 'inherit' });
  });

server
  .command('status')
  .description('Check if the server is healthy and responsive')
  .action(() => {
    spawnSync('node', [path.join(__dirname, 'generate.js'), '--health'], { stdio: 'inherit' });
  });

program.parse(process.argv);
