#!/usr/bin/env node
const fs = require('fs');
const config = require('./config');

async function check() {
    console.log('Draw Things Skill Diagnostic');
    console.log('============================');

    const serverPath = config.get('DRAWTHINGS_SERVER_PATH');
    const modelsPath = config.get('DRAWTHINGS_MODELS_PATH');

    // 1. Check if configured
    if (!serverPath || !modelsPath) {
        console.log('❌ Configuration: Missing');
        console.log('   Fix: Run "dt-skill config --server-path <path> --models-path <path>"');
        console.log('   Example: dt-skill config --server-path "/Applications/Draw Things.app/Contents/MacOS/gRPCServerCLI-macOS" --models-path "~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models"');
        return false;
    }
    console.log('✅ Configuration: Found');

    // 2. Check Server Binary
    const finalServerPath = serverPath.replace(/^~/, process.env.HOME || '');
    if (fs.existsSync(finalServerPath)) {
        console.log(`✅ Server Binary: Found at ${finalServerPath}`);
    } else {
        console.log(`❌ Server Binary: NOT FOUND at ${finalServerPath}`);
        console.log('   Fix: Ensure Draw Things is installed and the path is correct.');
        return false;
    }

    // 3. Check Models Directory
    const finalModelsPath = modelsPath.replace(/^~/, process.env.HOME || '');
    if (fs.existsSync(finalModelsPath)) {
        console.log(`✅ Models Directory: Found at ${finalModelsPath}`);
        
        // List models in the directory
        try {
            const files = fs.readdirSync(finalModelsPath);
            const models = files.filter(f => f.endsWith('.ckpt') || f.endsWith('.safetensors'));
            if (models.length > 0) {
                console.log(`   Found ${models.length} model(s):`);
                models.sort().slice(0, 10).forEach(m => console.log(`   - ${m}`));
                if (models.length > 10) console.log(`   ... and ${models.length - 10} more models.`);
            } else {
                console.log('   ⚠️ No .ckpt or .safetensors models found in this directory.');
            }
        } catch (e) {
            console.log(`   ⚠️ Failed to list models: ${e.message}`);
        }
    } else {
        console.log(`❌ Models Directory: NOT FOUND at ${finalModelsPath}`);
        console.log('   Fix: Ensure the models path is correct. Check Draw Things settings.');
        return false;
    }

    console.log('\nAll systems go! You can now run "dt-skill server start".');
    return true;
}

if (require.main === module) {
    check();
}

module.exports = check;
