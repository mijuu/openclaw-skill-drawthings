#!/usr/bin/env node
const fs = require('fs');
const config = require('./config');

async function check() {
    console.log('Draw Things Skill Diagnostic');
    console.log('============================');

    const serverPath = config.get('DRAWTHINGS_SERVER_PATH');
    const modelsPath = config.get('DRAWTHINGS_MODELS_PATH');

    // 1. Check Server Binary
    if (!serverPath) {
        console.log('❌ Server Binary: NOT CONFIGURED');
        console.log('   Fix: You need to specify the path to gRPCServerCLI-macOS.');
        console.log('   Run: dt-skill config --server-path "/path/to/gRPCServerCLI-macOS"');
    } else {
        const finalServerPath = serverPath.replace(/^~/, process.env.HOME || '');
        if (fs.existsSync(finalServerPath)) {
            console.log(`✅ Server Binary: Found at ${finalServerPath}`);
        } else {
            console.log(`❌ Server Binary: NOT FOUND at ${finalServerPath}`);
            console.log('   Fix: Ensure the path is correct or download the gRPC server CLI.');
        }
    }

    // 2. Check Models Directory
    if (!modelsPath) {
        console.log('❌ Models Directory: NOT CONFIGURED');
    } else {
        const finalModelsPath = modelsPath.replace(/^~/, process.env.HOME || '');
        if (fs.existsSync(finalModelsPath)) {
            console.log(`✅ Models Directory: Found at ${finalModelsPath}`);
            // List models in the directory
            try {
                const files = fs.readdirSync(finalModelsPath);
                const models = files.filter(f => f.endsWith('.ckpt') || f.endsWith('.safetensors'));
                if (models.length > 0) {
                    console.log(`   Found ${models.length} model(s).`);
                } else {
                    console.log('   ⚠️ No .ckpt or .safetensors models found in this directory.');
                }
            } catch (e) {}
        } else {
            console.log(`❌ Models Directory: NOT FOUND at ${finalModelsPath}`);
            console.log('   Note: This is the default Draw Things path. Is the App installed?');
        }
    }

    if (!serverPath || !modelsPath || !fs.existsSync(serverPath.replace(/^~/, process.env.HOME || '')) || !fs.existsSync(modelsPath.replace(/^~/, process.env.HOME || ''))) {
        console.log('\n⚠️ Some components are missing. Please complete the setup.');
        return false;
    }

    console.log('\nAll systems go! You can now run "dt-skill server start".');
    return true;
}

if (require.main === module) {
    check();
}

module.exports = check;
