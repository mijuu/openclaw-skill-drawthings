const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Configuration manager for Draw Things skill.
 * Stores settings in ~/.drawthings-skill/config.json
 */
class Config {
    constructor() {
        this.configDir = path.join(os.homedir(), '.drawthings-skill');
        this.configFile = path.join(this.configDir, 'config.json');
        this.data = {};
        this._ensureDir();
        this.load();
    }

    _ensureDir() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }

    load() {
        // Default values for common paths
        const homedir = os.homedir();
        const defaultModels = path.join(homedir, 'Library/Containers/com.liuliu.draw-things/Data/Documents/Models');
        
        this.data = {
            'DRAWTHINGS_SERVER_ADDR': '127.0.0.1:7859',
            'DRAWTHINGS_USE_TLS': true,
            'DRAWTHINGS_MODELS_PATH': defaultModels,
            'DRAWTHINGS_SERVER_PATH': ''
        };

        // 1. Try central config file first
        if (fs.existsSync(this.configFile)) {
            try {
                const content = fs.readFileSync(this.configFile, 'utf8');
                this.data = JSON.parse(content);
            } catch (e) {
                console.warn('Warning: Failed to parse central config file. Using empty config.');
                this.data = {};
            }
        }

        // 2. Environment variables take precedence (uppercase)
        const envKeys = [
            'DRAWTHINGS_SERVER_PATH',
            'DRAWTHINGS_MODELS_PATH',
            'DRAWTHINGS_SERVER_ADDR',
            'DRAWTHINGS_USE_TLS'
        ];
        envKeys.forEach(key => {
            if (process.env[key]) {
                this.data[key] = process.env[key];
            }
        });
    }

    save() {
        this._ensureDir();
        fs.writeFileSync(this.configFile, JSON.stringify(this.data, null, 2), 'utf8');
        // Restrict permissions
        try {
            fs.chmodSync(this.configFile, 0o600);
        } catch (e) {}
    }

    get(key, defaultValue = null) {
        return this.data[key] !== undefined ? this.data[key] : defaultValue;
    }

    set(key, value) {
        this.data[key] = value;
        this.save();
    }

    all() {
        return { ...this.data };
    }
}

module.exports = new Config();
