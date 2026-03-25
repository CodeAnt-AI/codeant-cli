import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.codeant');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const ensureConfigDir = () => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
  return {};
};

const saveConfig = (config) => {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

const getConfigValue = (key) => {
  const config = loadConfig();
  return config[key];
};

const setConfigValue = (key, value) => {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
};

export { loadConfig, saveConfig, getConfigValue, setConfigValue, CONFIG_FILE };
