const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '../client/src/pages/AdminDashboard.jsx');
const verifierPath = path.join(__dirname, '../client/src/pages/VerifierDashboard.jsx');

let adminCode = fs.readFileSync(adminPath, 'utf8');
let verifierCode = fs.readFileSync(verifierPath, 'utf8');

// 1. Remove specific blocks from AdminDashboard using string replacement

const stateBlockRegex = /  const \[ghostData, setGhostData\] = useState\(null\);\s*const \[ghostLoading, setGhostLoading\] = useState\(false\);\s*const \[expandedCluster, setExpandedCluster\] = useState\(null\);\s*\/\/ ── Phase 4\.1: Express Approval ──\s*const \[expressData, setExpressData\] = useState\(null\);\s*const \[expressLoading, setExpressLoading\] = useState\(false\);\s*const \[expandedExpress, setExpandedExpress\] = useState\(null\);\s*const \[copiedHash, setCopiedHash\] = useState\(null\);\s*/;

const fetchGhostRegex = /  const fetchGhost = async \(uname\) => \{\s*setGhostLoading\(true\);\s*try \{\s*const res = await fetch\(`\$\{API_BASE\}\/api\/analytics\/ghost-procedures`, \{\s*headers: \{ 'x-admin-user': uname \},\s*\}\);\s*const data = await res\.json\(\);\s*setGhostData\(data\);\s*\} catch \{ setGhostData\(null\); \}\s*finally \{ setGhostLoading\(false\); \}\s*\};\s*/;

const fetchExpressRegex = /  const fetchExpress = async \(uname\) => \{\s*setExpressLoading\(true\);\s*try \{\s*const res = await fetch\(`\$\{API_BASE\}\/api\/analytics\/express-approval`, \{\s*headers: \{ 'x-admin-user': uname \},\s*\}\);\s*const data = await res\.json\(\);\s*setExpressData\(data\);\s*\} catch \{ setExpressData\(null\); \}\s*finally \{ setExpressLoading\(false\); \}\s*\};\s*/;

const copyHashRegex = /  const copyHash = \(hash, id\) => \{\s*navigator\.clipboard\.writeText\(hash\)\.then\(\(\) => \{\s*setCopiedHash\(id\);\s*setTimeout\(\(\) => setCopiedHash\(null\), 2000\);\s*\}\);\s*\};\s*/;

const stateMatch = adminCode.match(stateBlockRegex);
const ghostFuncMatch = adminCode.match(fetchGhostRegex);
const expressFuncMatch = adminCode.match(fetchExpressRegex);
const copyHashMatch = adminCode.match(copyHashRegex);

if (!stateMatch || !ghostFuncMatch || !expressFuncMatch || !copyHashMatch) {
    console.error("Could not find some state or functions in AdminDashboard!");
    console.error("state:", !!stateMatch, "ghost:", !!ghostFuncMatch, "express:", !!expressFuncMatch, "copyHash:", !!copyHashMatch);
    process.exit(1);
}

const assembledLogic = stateMatch[0] + '\n' + ghostFuncMatch[0] + '\n' + expressFuncMatch[0] + '\n' + copyHashMatch[0];

adminCode = adminCode.replace(stateBlockRegex, '');
adminCode = adminCode.replace(fetchGhostRegex, '');
adminCode = adminCode.replace(fetchExpressRegex, '');
adminCode = adminCode.replace(copyHashRegex, '');

// 2. Remove useEffect calls from AdminDashboard
adminCode = adminCode.replace(/      fetchGhost\(adminUser\.username\);\s*\n/g, '');
adminCode = adminCode.replace(/      fetchExpress\(adminUser\.username\);\s*\n/g, '');

// 3. Remove tabs from AdminDashboard
const tabGhostRegex = /          \{\s*id:\s*'ghost'.*?\},?\s*\n/s;
const tabExpressRegex = /          \{\s*id:\s*'express'.*?\},?\s*\n/s;
adminCode = adminCode.replace(tabGhostRegex, '');
adminCode = adminCode.replace(tabExpressRegex, '');

// 4. Extract UI from AdminDashboard
const uiGhostRegex = /      \{\/\* ── Ghost Procedure Filters Tab ── \*\/\}\s*\{activeTab === 'ghost' && \((.*?)\n      \)\}\s*\n/s;
const uiExpressRegex = /      \{\/\* ── Phase 4\.1: Express Approval Tab ── \*\/\}\s*\{activeTab === 'express' && \((.*?)\n      \)\}\s*\n/s;

const ghostMatch = adminCode.match(uiGhostRegex);
const expressMatch = adminCode.match(uiExpressRegex);

if (!ghostMatch || !expressMatch) {
    console.error("Could not find UI blocks in AdminDashboard!");
    console.error("ghostUI:", !!ghostMatch, "expressUI:", !!expressMatch);
    process.exit(1);
}

const uiBlocks = ghostMatch[0] + '\n' + expressMatch[0];

adminCode = adminCode.replace(uiGhostRegex, '');
adminCode = adminCode.replace(uiExpressRegex, '');

// Replace 'x-admin-user' header to 'x-username' to match verifier API conventions, though it can still be 'x-admin-user' as long as the backend doesn't restrict it, but let's change to 'x-username'
let finalLogic = assembledLogic.replace(/adminUser\.username/g, "user.username");
finalLogic = finalLogic.replace(/'x-admin-user': uname/g, "'x-username': uname");

// Replace 'fetchGhost(adminUser.username)' inside UI to 'fetchGhost(user.username)'
let finalUiBlocks = uiBlocks.replace(/adminUser\.username/g, "user.username");

// 5. Add to VerifierDashboard
verifierCode = verifierCode.replace(
    /  const \[filter, setFilter\] = useState\('all'\);/,
    `  // Moved from AdminDashboard\n${finalLogic}\n  const [filter, setFilter] = useState('all');`
);

// useEffect
verifierCode = verifierCode.replace(
    /  useEffect\(\(\) => \{ fetchQueue\(\); \}, \[fetchQueue\]\);/,
    `  useEffect(() => { 
    fetchQueue(); 
    if (user) {
      fetchGhost(user.username);
      fetchExpress(user.username);
    }
  }, [fetchQueue, user]);`
);

// Tabs and UI blocks
verifierCode = verifierCode.replace(
    /  const \[filter, setFilter\] = useState\('all'\);/,
    `  const [filter, setFilter] = useState('all');\n  const [activeTab, setActiveTab] = useState('queue');`
);

const tabBarStr = `
      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0', overflowX: 'auto' }}>
        {[
          { id: 'queue', label: 'Anomalies Queue', icon: <AlertTriangle size={14} /> },
          { id: 'ghost', label: 'Ghost Filters', icon: <Ghost size={14} />, badge: ghostData?.clusters?.length || null },
          { id: 'express', label: 'Express Approval', icon: <Zap size={14} />, badge: expressData?.total || null, badgeColor: '#22c55e' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.6rem 1rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
            marginBottom: '-1px', transition: 'color 0.15s', whiteSpace: 'nowrap', position: 'relative'
          }}>
            {tab.icon} {tab.label}
            {tab.badge > 0 && (
              <span style={{ fontSize: '0.55rem', fontWeight: 900, background: tab.badgeColor || '#ef4444', color: '#fff', borderRadius: 99, padding: '0.1rem 0.35rem', marginLeft: '0.2rem' }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
`;

// Find where to insert the tab bar: right after the header, replacing the existing queue filter tabs?
// Actually VerifierDashboard has `<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>`
// We'll replace that div with our Tab Bar + that div wrapped in `{activeTab === 'queue' && (`

verifierCode = verifierCode.replace(
    /      <div style=\{\{ display: 'flex', gap: '0\.5rem', marginBottom: '1\.5rem', overflowX: 'auto', paddingBottom: '0\.5rem' \}\}>/,
    `${tabBarStr}\n\n      {activeTab === 'queue' && (\n        <div>\n          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>`
);

// We need to close the queue block right before `</div>\n  );\n}` at the end of the file
verifierCode = verifierCode.replace(
    /    <\/div>\n  \);\n\}\n$/,
    `        </div>\n      )}\n\n${finalUiBlocks}\n\n    </div>\n  );\n}\n`
);

// Imports
verifierCode = verifierCode.replace(
    /import \{\n  ShieldAlert, Check, X, Flag, RefreshCw, ChevronRight,\n  AlertTriangle, Clock, User, FileText, Stethoscope, Calendar,\n  Building2, Hash, ArrowLeft,\n\} from 'lucide-react';/,
    `import {\n  ShieldAlert, Check, X, Flag, RefreshCw, ChevronRight,\n  AlertTriangle, Clock, User, FileText, Stethoscope, Calendar,\n  Building2, Hash, ArrowLeft,\n  Ghost, Zap, ChevronsUp, ChevronDown, CheckCircle2, Copy\n} from 'lucide-react';`
);

fs.writeFileSync(adminPath, adminCode);
fs.writeFileSync(verifierPath, verifierCode);
console.log("Refactor script completed successfully.");
