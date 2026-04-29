require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// ─── Persistent JSON File Store ───────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'local_db.json');

let localStore = { users: [], actions: [], medical_records: [] };

if (fs.existsSync(DB_FILE)) {
    try {
        localStore = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        console.log(`[LocalDB] Loaded ${Object.values(localStore).flat().length} records from local_db.json`);
    } catch {
        console.warn('[LocalDB] Corrupt local_db.json — starting fresh');
    }
}

const save = () => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(localStore, null, 2)); }
    catch (e) { console.error('[LocalDB] Save failed:', e.message); }
};

const col = (name) => {
    if (!localStore[name]) localStore[name] = [];
    return {
        findOne: async (q = {}) =>
            localStore[name].find(doc =>
                Object.entries(q).every(([k, v]) => doc[k] === v)
            ) ?? null,

        insertOne: async (doc) => {
            const newDoc = { ...doc, _id: `local_${Date.now()}_${Math.random().toString(36).slice(2,7)}` };
            localStore[name].push(newDoc);
            save();
            return { insertedId: newDoc._id };
        },

        updateOne: async (q, update, opts = {}) => {
            const idx = localStore[name].findIndex(doc =>
                Object.entries(q).every(([k, v]) => doc[k] === v)
            );
            if (idx !== -1) {
                if (update.$set)   Object.assign(localStore[name][idx], update.$set);
                if (update.$unset) Object.keys(update.$unset).forEach(k => delete localStore[name][idx][k]);
                save();
                return { modifiedCount: 1 };
            }
            if (opts.upsert) {
                const newDoc = { ...q, ...(update.$set || {}), _id: `local_${Date.now()}` };
                localStore[name].push(newDoc);
                save();
                return { modifiedCount: 0, upsertedId: newDoc._id };
            }
            return { modifiedCount: 0 };
        },

        find: (q = {}) => ({
            sort: () => ({
                limit: (n = 100) => ({
                    toArray: async () =>
                        localStore[name]
                            .filter(doc => Object.entries(q).every(([k, v]) => doc[k] === v))
                            .slice(-n)
                            .reverse()
                })
            })
        })
    };
};

// ─── Public API ───────────────────────────────────────────────────────────────
const connectToDB = async () => null;  // No-op — always use local

const getDB = () => ({ collection: (name) => col(name) });

module.exports = { connectToDB, getDB };
