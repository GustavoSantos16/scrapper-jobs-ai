const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'storage', 'database.json');

async function readDatabase() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const initial = {
        resume: null,
        jobs: [],
        history: [],
        emailStats: {
          currentDay: null,
          sentToday: 0
        }
      };
      await writeDatabase(initial);
      return initial;
    }
    throw err;
  }
}

async function writeDatabase(data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(DB_PATH, json, 'utf8');
}

module.exports = {
  readDatabase,
  writeDatabase
};

