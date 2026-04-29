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

        find: (q = {}) => {
            const matchesQuery = (doc, query) => {
                if (Object.keys(query).length === 0) return true;
                return Object.entries(query).every(([k, v]) => {
                    // Handle $or at the top level
                    if (k === '$or' && Array.isArray(v)) return v.some(sub => matchesQuery(doc, sub));
                    if (k === '$and' && Array.isArray(v)) return v.every(sub => matchesQuery(doc, sub));
                    if (v && typeof v === 'object') {
                        if ('$in'     in v) return v.$in.includes(doc[k]);
                        if ('$nin'    in v) return !v.$nin.includes(doc[k]);
                        if ('$ne'     in v) return doc[k] !== v.$ne;
                        if ('$exists' in v) return v.$exists ? (k in doc && doc[k] !== undefined) : !(k in doc) || doc[k] === undefined;
                    }
                    return doc[k] === v;
                });
            };
            let results = localStore[name].filter(doc => matchesQuery(doc, q));
            const cursor = {
                sort: () => { results.reverse(); return cursor; },
                limit: (n) => { results = results.slice(0, n); return cursor; },
                toArray: async () => results
            };
            return cursor;
        },

        deleteOne: async (q) => {
            const idx = localStore[name].findIndex(doc => Object.entries(q).every(([k, v]) => doc[k] === v));
            if (idx !== -1) {
                localStore[name].splice(idx, 1);
                save();
                return { deletedCount: 1 };
            }
            return { deletedCount: 0 };
        },

        deleteMany: async (q) => {
            const initialLen = localStore[name].length;
            localStore[name] = localStore[name].filter(doc => {
                if (q._id && q._id.$in) return !q._id.$in.includes(doc._id);
                return !Object.entries(q).every(([k, v]) => doc[k] === v);
            });
            save();
            return { deletedCount: initialLen - localStore[name].length };
        }
    };
};

// ─── Public API ───────────────────────────────────────────────────────────────
const connectToDB = async () => null;  // No-op — always use local

const getDB = () => ({ collection: (name) => col(name) });

module.exports = { connectToDB, getDB };
