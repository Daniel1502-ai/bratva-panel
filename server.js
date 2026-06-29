const express = require("express");
const cors = require("cors");
const session = require("express-session");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
const dbPath =
  process.env.DB_PATH ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "database.db")
    : path.join(__dirname, "database.db"));
const db = new Database(dbPath);

// ── DISCORD WEBHOOK ──
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1503895904934035601/Qdu4p91CB4XpO4bE5a1QsxOtjClIpxY9OgnlGMicx6yvUlaF2Eo5o2oxDlLz0mLG_jkM";

async function notifyDiscord(embed){
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch(e) {
    console.error("Discord webhook error:", e.message);
  }
}

db.pragma("journal_mode = WAL");

app.use(express.json());
app.use(express.static("public"));
app.use(cors());
app.use(session({
    secret: "bratva_secret",
    resave: true,
    saveUninitialized: true
}));

// ---------- DB ----------
db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    password TEXT,
    role TEXT,
    cnp TEXT
)`);
try { db.exec(`ALTER TABLE users ADD COLUMN cnp TEXT`); } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN org TEXT DEFAULT 'bratva'`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS bratva (
    id INTEGER PRIMARY KEY,
    nume TEXT, cnp TEXT, telefon TEXT,
    masca INTEGER, bandana INTEGER, manusa INTEGER, sindicat INTEGER, grad TEXT
)`);
try { db.exec(`ALTER TABLE bratva ADD COLUMN taskSaptamanal TEXT DEFAULT 'Nu'`); } catch {}
try { db.exec(`ALTER TABLE bratva ADD COLUMN recuperare INTEGER DEFAULT 0`); } catch {}
try { db.exec(`ALTER TABLE bratva ADD COLUMN retired INTEGER DEFAULT 0`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS sputnik (
    id INTEGER PRIMARY KEY,
    nume TEXT, cnp TEXT, telefon TEXT, grad TEXT,
    task TEXT, taskAvansari TEXT, invoire TEXT, prezenta TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS sputnik2 (
    id INTEGER PRIMARY KEY,
    nume TEXT, cnp TEXT, telefon TEXT, grad TEXT,
    task TEXT, taskAvansari TEXT, invoire TEXT, prezenta TEXT
)`);
// Dynamic sputnik pages metadata
db.exec(`CREATE TABLE IF NOT EXISTS sputnik_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_num INTEGER UNIQUE,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now'))
)`);
// Ensure base pages exist in metadata
try { db.prepare("INSERT OR IGNORE INTO sputnik_pages (page_num,title) VALUES (1,'Pagina 1')").run(); } catch {}
try { db.prepare("INSERT OR IGNORE INTO sputnik_pages (page_num,title) VALUES (2,'Pagina 2')").run(); } catch {}

// Helper: get all sputnik page numbers
function getSputnikPages() {
    return db.prepare("SELECT page_num FROM sputnik_pages ORDER BY page_num").all().map(r => r.page_num);
}
// Helper: get table name for page num
function sputnikTable(n) { return n === 1 ? 'sputnik' : `sputnik${n}`; }
// Helper: ensure sputnik table exists for page n
function ensureSputnikTable(n) {
    const tbl = sputnikTable(n);
    db.exec(`CREATE TABLE IF NOT EXISTS ${tbl} (
        id INTEGER PRIMARY KEY,
        nume TEXT, cnp TEXT, telefon TEXT, grad TEXT,
        task TEXT, taskAvansari TEXT, invoire TEXT, prezenta TEXT
    )`);
}
// Ensure existing pages have their tables
getSputnikPages().forEach(n => ensureSputnikTable(n));
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, description TEXT,
    priority TEXT DEFAULT 'normal',
    assignedTo TEXT DEFAULT 'all',
    faction TEXT DEFAULT 'all',
    status TEXT DEFAULT 'activ',
    deadline TEXT DEFAULT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
)`);
try { db.exec(`ALTER TABLE tasks ADD COLUMN deadline TEXT DEFAULT NULL`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    taskId INTEGER,
    amendaId INTEGER,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
)`);
try { db.exec(`ALTER TABLE notifications ADD COLUMN amendaId INTEGER`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS invoiri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    username TEXT,
    cnp TEXT,
    nume TEXT,
    startDate TEXT NOT NULL,
    durataZile INTEGER NOT NULL,
    endDate TEXT NOT NULL,
    motiv TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
)`);
try { db.exec(`ALTER TABLE invoiri ADD COLUMN ora TEXT`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN startTime TEXT`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN endTime TEXT`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN org TEXT DEFAULT 'bratva'`); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS service (
    id INTEGER PRIMARY KEY,
    nume TEXT, grad TEXT, pontaj TEXT
)`);
try { db.exec(`ALTER TABLE service ADD COLUMN cnp TEXT`); } catch {}
try { db.exec(`ALTER TABLE service ADD COLUMN telefon TEXT`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN org TEXT DEFAULT 'bratva'`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN ora TEXT DEFAULT NULL`); } catch {}
try { db.exec(`ALTER TABLE notifications ADD COLUMN org TEXT DEFAULT 'bratva'`); } catch {}

// AMENZI TABLE
db.exec(`CREATE TABLE IF NOT EXISTS hack_leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    time_seconds INTEGER NOT NULL,
    achieved_at TEXT DEFAULT (datetime('now','localtime'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS amenzi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cnp TEXT NOT NULL,
    nume TEXT NOT NULL,
    suma INTEGER NOT NULL,
    motiv TEXT NOT NULL,
    termen TEXT NOT NULL,
    status TEXT DEFAULT 'activa',
    org TEXT DEFAULT 'bratva',
    faction TEXT DEFAULT 'bratva',
    postedBy TEXT NOT NULL,
    postedAt TEXT DEFAULT (datetime('now'))
)`);

// ---------- AUTO-EXPIRY ----------
function checkExpiredTasks() {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const expiredTasks = db.prepare(
        `SELECT * FROM tasks WHERE status='activ' AND deadline IS NOT NULL AND deadline!='' AND deadline<=?`
    ).all(now);

    if (!expiredTasks.length) return;

    const updateTask = db.prepare(`UPDATE tasks SET status='expirat' WHERE id=?`);
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message,org) VALUES (?,?,?,?)`);
    const getUserByName = db.prepare(`SELECT id,org,role FROM users WHERE username=?`);

    for (const task of expiredTasks) {
        updateTask.run(task.id);
        if (task.assignedTo && task.assignedTo !== 'all') {
            const u = getUserByName.get(task.assignedTo);
            if (u) insertNotif.run(u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`, u.org || 'bratva');
        } else {
            const users = db.prepare(`SELECT id,COALESCE(org,'bratva') as org FROM users`).all();
            for (const u of users) {
                insertNotif.run(u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`, u.org || 'bratva');
            }
        }
    }
}

function checkExpiredAmenzi() {
    const now = new Date().toISOString().substring(0, 10);
    db.prepare(`UPDATE amenzi SET status='expirata' WHERE status='activa' AND termen < ?`).run(now);
}

setInterval(checkExpiredTasks, 60 * 1000);
setInterval(checkExpiredAmenzi, 60 * 1000);
setTimeout(checkExpiredTasks, 2000);
setTimeout(checkExpiredAmenzi, 2000);

// ---------- AUTH ----------
function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).send("Login necesar");
    next();
}
function requireRole(role) {
    return (req, res, next) => {
        if (!req.session.user) return res.status(401).send("Login");
        if (req.session.user.role.toLowerCase() !== role.toLowerCase()) return res.status(403).send("Interzis");
        next();
    };
}

function isLeaderUser(user) {
    return !!user && String(user.role || '').toLowerCase() === 'leader';
}

app.post("/login", async (req, res) => {
    const { username, password, org } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
    if (!user) return res.status(401).send("User invalid");
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).send("Parolă greșită");
    const userOrg = (user.org || 'bratva').toLowerCase();
    if (org && username !== 'admin') {
        if (userOrg !== org.toLowerCase()) return res.status(403).send("Cont nepermis pentru această secțiune");
    }
    if (username === 'admin' && org) user.org = org.toLowerCase();
    else user.org = userOrg;
    req.session.user = user;
    res.send("OK");
});

app.get("/me", (req, res) => { res.json(req.session.user || null); });
app.post("/logout", (req, res) => { req.session.destroy(); res.send("OK"); });

app.post("/register", async (req, res) => {
    const { username, password, cnp, org } = req.body;
    const orgVal = (org || 'bratva').toLowerCase() === 'service' ? 'service' : 'bratva';
    if (!username || !password) return res.status(400).send("Date incomplete");
    if (password.length < 6) return res.status(400).send("Parola prea scurta");
    if (!cnp || cnp.trim() === '') return res.status(400).send("CNP-ul este obligatoriu");

    let member;
    if (orgVal === 'service') {
        member = db.prepare(`SELECT nume FROM service WHERE cnp=? LIMIT 1`).get(cnp.trim());
    } else {
        member = db.prepare(`SELECT nume FROM bratva WHERE cnp=?`).get(cnp.trim());
        if (!member) {
            for (const pn of getSputnikPages()) {
                ensureSputnikTable(pn);
                member = db.prepare(`SELECT nume FROM ${sputnikTable(pn)} WHERE cnp=?`).get(cnp.trim());
                if (member) break;
            }
        }
    }
    if (!member) return res.status(403).send("CNP-ul nu este înregistrat în organizație");

    const existing = db.prepare("SELECT id FROM users WHERE username=?").get(username);
    if (existing) return res.status(409).send("Username deja folosit");

    const existingCnp = db.prepare("SELECT id FROM users WHERE cnp=?").get(cnp.trim());
    if (existingCnp) return res.status(409).send("CNP deja înregistrat");

    const hash = await bcrypt.hash(password, 10);
    db.prepare("INSERT INTO users (username,password,role,cnp,org) VALUES (?,?,?,?,?)")
      .run(username, hash, "member", cnp.trim(), orgVal);
    res.send("OK");
});

// ---------- BRATVA ----------
app.get("/bratva", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM bratva").all();
    const set = getActiveInvoireCnps((req.session.user.org || 'bratva').toLowerCase());
    rows.forEach(r => {
        r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu";
        const amenda = db.prepare(`SELECT id FROM amenzi WHERE cnp=? AND status='activa' LIMIT 1`).get(r.cnp || '');
        r.amendaActiva = amenda ? 1 : 0;
    });
    res.json(rows);
});

app.post("/bratva", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM bratva").run();
    const stmt = db.prepare(`INSERT INTO bratva (nume,cnp,telefon,masca,bandana,manusa,sindicat,grad,taskSaptamanal,recuperare,retired) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    for (const d of req.body) stmt.run(
        d.nume,
        d.cnp,
        d.telefon,
        d.masca ? 1 : 0,
        d.bandana ? 1 : 0,
        d.manusa ? 1 : 0,
        d.sindicat ? 1 : 0,
        d.grad,
        d.taskSaptamanal || 'Nu',
        d.recuperare ? 1 : 0,
        d.retired ? 1 : 0
    );
    res.send("Saved");
});

// ---------- SPUTNIK ----------
app.get("/sputnik", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM sputnik").all();
    const set = getActiveInvoireCnps((req.session.user.org || 'bratva').toLowerCase());
    rows.forEach(r => {
        r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu";
        const amenda = db.prepare(`SELECT id FROM amenzi WHERE cnp=? AND status='activa' LIMIT 1`).get(r.cnp || '');
        r.amendaActiva = amenda ? 1 : 0;
    });
    res.json(rows);
});

app.post("/sputnik", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM sputnik").run();
    const stmt = db.prepare(`INSERT INTO sputnik (nume,cnp,telefon,grad,task,taskAvansari,invoire,prezenta) VALUES (?,?,?,?,?,?,?,?)`);
    for (const d of req.body) stmt.run(d.nume, d.cnp, d.telefon, d.grad, d.task, d.taskAvansari, d.invoire, d.prezenta);
    res.send("Saved");
});

// ---------- SPUTNIK 2 ----------
app.get("/sputnik2", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM sputnik2").all();
    const set = getActiveInvoireCnps((req.session.user.org || 'bratva').toLowerCase());
    rows.forEach(r => {
        r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu";
        const amenda = db.prepare(`SELECT id FROM amenzi WHERE cnp=? AND status='activa' LIMIT 1`).get(r.cnp || '');
        r.amendaActiva = amenda ? 1 : 0;
    });
    res.json(rows);
});

app.post("/sputnik2", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM sputnik2").run();
    const stmt = db.prepare(`INSERT INTO sputnik2 (nume,cnp,telefon,grad,task,taskAvansari,invoire,prezenta) VALUES (?,?,?,?,?,?,?,?)`);
    for (const d of req.body) stmt.run(d.nume, d.cnp, d.telefon, d.grad, d.task, d.taskAvansari, d.invoire, d.prezenta);
    res.send("Saved");
});

// ---------- SERVICE ----------
app.get("/service", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM service").all();
    const set = getActiveInvoireCnps((req.session.user.org || 'bratva').toLowerCase());
    rows.forEach(r => {
        r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu";
        const amenda = db.prepare(`SELECT id FROM amenzi WHERE cnp=? AND status='activa' LIMIT 1`).get(r.cnp || '');
        r.amendaActiva = amenda ? 1 : 0;
    });
    res.json(rows);
});

app.post("/service", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM service").run();
    const stmt = db.prepare(`INSERT INTO service (nume,cnp,grad,pontaj,telefon) VALUES (?,?,?,?,?)`);
    for (const d of req.body) stmt.run(d.nume, d.cnp, d.grad, d.pontaj, d.telefon || '');
    res.send("Saved");
});

// ---------- SERVICE MEMBERS LIST ----------
app.get("/service-members", requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT nume, cnp FROM service WHERE nume IS NOT NULL AND nume!='' ORDER BY nume`).all();
    res.json(rows);
});

// ---------- TASKS ----------
app.get("/tasks", requireAuth, (req, res) => {
    res.json(db.prepare("SELECT * FROM tasks ORDER BY createdAt DESC").all());
});

app.get("/my-member-name", requireAuth, (req, res) => {
    const cnp = req.session.user.cnp;
    if (!cnp) return res.json({ names: [] });
    let nameRows = db.prepare(`SELECT nume FROM bratva WHERE cnp=?`).all(cnp);
    for (const pn of getSputnikPages()) {
        ensureSputnikTable(pn);
        const r = db.prepare(`SELECT nume FROM ${sputnikTable(pn)} WHERE cnp=?`).all(cnp);
        nameRows = nameRows.concat(r);
    }
    res.json({ names: nameRows.map(r => r.nume).filter(Boolean) });
});

app.get("/members", requireAuth, (req, res) => {
    let rows = db.prepare(`SELECT nume,'Bratva' as faction FROM bratva WHERE nume IS NOT NULL AND nume!=''`).all();
    for (const pn of getSputnikPages()) {
        ensureSputnikTable(pn);
        const sRows = db.prepare(`SELECT nume,'Sputnik' as faction FROM ${sputnikTable(pn)} WHERE nume IS NOT NULL AND nume!=''`).all();
        rows = rows.concat(sRows);
    }
    rows.sort((a,b) => a.faction.localeCompare(b.faction) || (a.nume||'').localeCompare(b.nume||''));
    res.json(rows);
});

// All bratva+sputnik members with cnp for amenda form
app.get("/bratva-members", requireAuth, (req, res) => {
    let rows = db.prepare(`SELECT nume, cnp, 'Bratva' as faction FROM bratva WHERE nume IS NOT NULL AND nume!=''`).all();
    for (const pn of getSputnikPages()) {
        ensureSputnikTable(pn);
        const sRows = db.prepare(`SELECT nume, cnp, 'Sputnik' as faction FROM ${sputnikTable(pn)} WHERE nume IS NOT NULL AND nume!=''`).all();
        rows = rows.concat(sRows);
    }
    rows.sort((a,b) => a.faction.localeCompare(b.faction) || (a.nume||'').localeCompare(b.nume||''));
    res.json(rows);
});

app.post("/tasks", requireRole("leader"), (req, res) => {
    const { title, description, priority, assignedTo, faction, deadline } = req.body;
    if (!title) return res.status(400).send("Titlul este obligatoriu");
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let deadlineVal = null;
    if (deadline && deadline.trim() !== '') deadlineVal = deadline.replace('T', ' ') + ':00';

    const result = db.prepare(
        `INSERT INTO tasks (title,description,priority,assignedTo,faction,status,deadline,createdAt) VALUES (?,?,?,?,?,'activ',?,?)`
    ).run(title, description || "", priority || "normal", assignedTo || "all", faction || "all", deadlineVal, now);

    const taskId = result.lastInsertRowid;
    const assigned = assignedTo || 'all';
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message,org) VALUES (?,?,?,?)`);

    if (assigned !== 'all') {
        const u = db.prepare(`SELECT id FROM users WHERE username=?`).get(assigned);
        if (u) insertNotif.run(u.id, taskId, `📋 Ai primit un task nou: "${title}"`, userOrg);
    } else {
        const users = db.prepare(`SELECT id FROM users WHERE COALESCE(org,'bratva')=?`).all(userOrg);
        for (const u of users) insertNotif.run(u.id, taskId, `📋 Task nou pentru toți: "${title}"`, userOrg);
    }

    // Discord notification
    const priorityEmoji = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟠' : '🟡';
    const factionLabel = faction === 'sputnik' ? '⚡ Sputnik' : faction === 'service' ? '⚙️ Service' : '🔱 Bratva';
    const assignedLabel = assigned === 'all' ? 'Toți membrii' : assigned;
    const deadlineLabel = deadlineVal ? deadlineVal.substring(0,10) : 'Fără termen';
    notifyDiscord({
      title: `📋 Task Nou — ${title}`,
      color: priority === 'urgent' ? 0xe74c3c : priority === 'high' ? 0xe67e22 : 0xf1c40f,
      fields: [
        { name: "📌 Prioritate", value: `${priorityEmoji} ${priority || 'normal'}`, inline: true },
        { name: "👥 Atribuit", value: assignedLabel, inline: true },
        { name: "🏴 Facțiune", value: factionLabel, inline: true },
        { name: "⏰ Termen", value: deadlineLabel, inline: true },
        { name: "👤 Postat de", value: req.session.user.username, inline: true },
        ...(description ? [{ name: "📝 Descriere", value: description.substring(0,200), inline: false }] : [])
      ],
      footer: { text: "Bratva Panel • Notificări Site" },
      timestamp: new Date().toISOString()
    });

    res.json({ id: taskId });
});

app.patch("/tasks/:id", requireAuth, (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE tasks SET status=? WHERE id=?").run(status, req.params.id);
    res.send("OK");
});

app.delete("/tasks/:id", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM tasks WHERE id=?").run(req.params.id);
    res.send("OK");
});

// ---------- AMENZI ----------
app.get("/amenzi-data", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const { faction } = req.query;
    let query = `SELECT * FROM amenzi WHERE org=?`;
    const params = [userOrg];
    if (faction) { query += ` AND faction=?`; params.push(faction); }
    query += ` ORDER BY postedAt DESC`;
    res.json(db.prepare(query).all(...params));
});

app.get("/amenzi-data/my", requireAuth, (req, res) => {
    const cnp = req.session.user.cnp;
    if (!cnp) return res.json([]);
    const rows = db.prepare(`SELECT * FROM amenzi WHERE cnp=? ORDER BY postedAt DESC`).all(cnp);
    res.json(rows);
});

app.get("/amenzi-data/:id", requireAuth, (req, res) => {
    const row = db.prepare(`SELECT * FROM amenzi WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).send("Inexistent");
    res.json(row);
});

app.post("/amenzi-data", requireRole("leader"), (req, res) => {
    const { cnp, nume, suma, motiv, termen, faction } = req.body;
    if (!cnp || !nume || !suma || !motiv || !termen) return res.status(400).send("Date incomplete");
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const factionVal = faction || userOrg;
    const postedBy = req.session.user.username;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const result = db.prepare(
        `INSERT INTO amenzi (cnp,nume,suma,motiv,termen,status,org,faction,postedBy,postedAt) VALUES (?,?,?,?,?,'activa',?,?,?,?)`
    ).run(cnp, nume, parseInt(suma), motiv, termen, userOrg, factionVal, postedBy, now);

    const amendaId = result.lastInsertRowid;

    // Notify the member
    const u = db.prepare(`SELECT id FROM users WHERE cnp=?`).get(cnp);
    if (u) {
        db.prepare(`INSERT INTO notifications (userId,amendaId,message,org) VALUES (?,?,?,?)`)
          .run(u.id, amendaId, `⚠️ Ai primit o amendă nouă!`, userOrg);
    }

    // Discord notification
    const factionLabelA = factionVal === 'sputnik' ? '⚡ Sputnik' : factionVal === 'service' ? '⚙️ Service' : '🔱 Bratva';
    const sumaFmt = parseInt(suma).toLocaleString('ro-RO') + '$';
    notifyDiscord({
      title: `⚠️ Amendă Nouă`,
      color: 0xe74c3c,
      fields: [
        { name: "👤 Membru", value: nume, inline: true },
        { name: "🏴 Facțiune", value: factionLabelA, inline: true },
        { name: "💰 Sumă", value: sumaFmt, inline: true },
        { name: "⏰ Termen", value: termen, inline: true },
        { name: "👮 Postat de", value: postedBy, inline: true },
        { name: "📝 Motiv", value: motiv.substring(0,200), inline: false }
      ],
      footer: { text: "Bratva Panel • Notificări Site" },
      timestamp: new Date().toISOString()
    });

    res.json({ id: amendaId });
});

app.patch("/amenzi-data/:id/platita", requireRole("leader"), (req, res) => {
    db.prepare(`UPDATE amenzi SET status='platita' WHERE id=?`).run(req.params.id);
    res.send("OK");
});

app.delete("/amenzi-data/:id", requireRole("leader"), (req, res) => {
    db.prepare(`DELETE FROM amenzi WHERE id=?`).run(req.params.id);
    res.send("OK");
});

// ---------- NOTIFICATIONS ----------
app.get("/notifications/count", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const row = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE userId=? AND read=0 AND COALESCE(org,'bratva')=?`).get(req.session.user.id, userOrg);
    res.json({ count: row ? row.count : 0 });
});

app.get("/notifications", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const rows = db.prepare(`SELECT * FROM notifications WHERE userId=? AND COALESCE(org,'bratva')=? ORDER BY createdAt DESC LIMIT 30`).all(req.session.user.id, userOrg);
    res.json(rows);
});

app.patch("/notifications/:id/read", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    db.prepare(`UPDATE notifications SET read=1 WHERE id=? AND userId=? AND COALESCE(org,'bratva')=?`).run(req.params.id, req.session.user.id, userOrg);
    res.send("OK");
});

app.post("/notifications/read-all", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    db.prepare(`UPDATE notifications SET read=1 WHERE userId=? AND COALESCE(org,'bratva')=?`).run(req.session.user.id, userOrg);
    res.send("OK");
});

// ---------- ADMIN ----------
app.get("/admin/users", requireRole("leader"), (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    res.json(db.prepare("SELECT id,username,role,cnp FROM users WHERE COALESCE(org,'bratva')=? ORDER BY id ASC").all(userOrg));
});

app.patch("/admin/users/:id/role", requireRole("leader"), (req, res) => {
    const { role } = req.body;
    if (!["leader", "member"].includes((role || "").toLowerCase())) return res.status(400).send("Rol invalid");
    if (parseInt(req.params.id) === req.session.user.id) return res.status(403).send("Nu îți poți schimba propriul rol");
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role.toLowerCase(), req.params.id);
    res.send("OK");
});

app.delete("/admin/users/:id", requireRole("leader"), (req, res) => {
    if (parseInt(req.params.id) === req.session.user.id) return res.status(403).send("Nu te poți șterge pe tine însuți");
    db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
    res.send("OK");
});

// ---------- INVOIRI ----------
function addDays(dateStr, days) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + parseInt(days, 10));
    return d.toISOString().substring(0, 10);
}

const INVOIRE_TIMEZONE = "Europe/Bucharest";

function normalizeInvoireTime(timeStr, fallbackTime) {
    return /^\d{2}:\d{2}$/.test(timeStr || '') ? timeStr : fallbackTime;
}

function buildInvoireDateTimeKey(dateStr, timeStr, fallbackTime) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
    return `${dateStr}T${normalizeInvoireTime(timeStr, fallbackTime)}`;
}

function getBucharestNowKey(now = new Date()) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: INVOIRE_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);
    const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function getInvoireStart(row) {
    return buildInvoireDateTimeKey(row.startDate, row.startTime || row.ora, "00:00");
}

function getInvoireEnd(row) {
    return buildInvoireDateTimeKey(row.endDate, row.endTime || row.ora, "23:59");
}

function isInvoireActive(row, now = new Date()) {
    const start = getInvoireStart(row);
    const end = getInvoireEnd(row);
    if (!start || !end) return false;
    const nowKey = getBucharestNowKey(now);
    return start <= nowKey && nowKey <= end;
}

function getActiveInvoireCnps(org) {
    const rows = db.prepare(`
        SELECT cnp, startDate, endDate, startTime, endTime, ora
        FROM invoiri
        WHERE COALESCE(org,'bratva')=?
    `).all(org);
    return new Set(
        rows
            .filter((row) => isInvoireActive(row))
            .map((row) => (row.cnp || '').trim())
            .filter(Boolean)
    );
}

app.get("/invoiri", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const rows = db.prepare(`
        SELECT * FROM invoiri
        WHERE COALESCE(org,'bratva')=?
        ORDER BY startDate DESC, COALESCE(startTime, ora, '00:00') DESC, id DESC
    `).all(userOrg);
    const list = rows.map(r => ({ ...r, activa: isInvoireActive(r) ? 1 : 0 }));
    res.json(list);
});

app.post("/invoiri", requireAuth, async (req, res) => {
    const { startDate, startTime, endDate: requestedEndDate, endTime, motiv } = req.body;
    const u = req.session.user;
    const userOrg = (u.org || 'bratva').toLowerCase();
    if (!startDate || !startTime || !requestedEndDate || !endTime) {
        return res.status(400).send("Intervalul complet este obligatoriu");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(requestedEndDate)) {
        return res.status(400).send("Dată invalidă");
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
        return res.status(400).send("Oră invalidă");
    }
    const startAt = parseInvoireDateTime(startDate, startTime, "00:00");
    const endAt = parseInvoireDateTime(requestedEndDate, endTime, "23:59");
    if (!startAt || !endAt) return res.status(400).send("Interval invalid");
    if (endAt.getTime() <= startAt.getTime()) {
        return res.status(400).send("Sfârșitul trebuie să fie după început");
    }
    const endDate = requestedEndDate;
    const durataZileValue = Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000)));

    let member;
    if (userOrg === 'service') {
        member = db.prepare(`SELECT nume FROM service WHERE cnp=? LIMIT 1`).get(u.cnp || '');
    } else {
        member = db.prepare(`SELECT nume FROM bratva WHERE cnp=?`).get(u.cnp || '');
        if (!member) {
            for (const pn of getSputnikPages()) {
                ensureSputnikTable(pn);
                member = db.prepare(`SELECT nume FROM ${sputnikTable(pn)} WHERE cnp=?`).get(u.cnp || '');
                if (member) break;
            }
        }
    }
    const nume = member ? member.nume : u.username;

    const result = db.prepare(
        `INSERT INTO invoiri (userId,username,cnp,nume,startDate,startTime,ora,durataZile,endDate,endTime,motiv,org) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(u.id, u.username, u.cnp || '', nume, startDate, startTime, startTime, durataZileValue, endDate, endTime, (motiv || '').trim(), userOrg);

    const leaders = db.prepare(
        `SELECT id FROM users WHERE LOWER(role)='leader' AND (COALESCE(org,'bratva')=? OR username='admin')`
    ).all(userOrg);
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message,org) VALUES (?,?,?,?)`);
    for (const l of leaders) {
        insertNotif.run(l.id, null, `📅 ${nume} a postat o învoire (${startDate} → ${endDate})`, userOrg);
    }

    res.json({ id: result.lastInsertRowid, endDate, endTime });
});

app.delete("/invoiri/:id", requireAuth, (req, res) => {
    const u = req.session.user;
    const row = db.prepare(`SELECT * FROM invoiri WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).send("Inexistent");
    if (row.userId !== u.id && u.role.toLowerCase() !== 'leader') return res.status(403).send("Interzis");
    db.prepare(`DELETE FROM invoiri WHERE id=?`).run(req.params.id);
    res.send("OK");
});

// ---------- DYNAMIC SPUTNIK PAGES API ----------
// Get list of all sputnik pages
app.get("/sputnik-pages", requireAuth, (req, res) => {
    const pages = db.prepare("SELECT * FROM sputnik_pages ORDER BY page_num").all();
    res.json(pages);
});

// Create a new sputnik page (leader only)
app.post("/sputnik-create-page", requireRole("leader"), (req, res) => {
    const pages = getSputnikPages();
    const nextNum = pages.length > 0 ? Math.max(...pages) + 1 : 1;
    const title = req.body.title || `Pagina ${nextNum}`;
    try {
        ensureSputnikTable(nextNum);
        db.prepare("INSERT INTO sputnik_pages (page_num, title) VALUES (?, ?)").run(nextNum, title);
        res.json({ page_num: nextNum, title });
    } catch(e) {
        res.status(500).send("Eroare la creare pagina: " + e.message);
    }
});

// Delete a sputnik page (leader only, can't delete page 1 or 2)
app.delete("/sputnik-page/:n", requireRole("leader"), (req, res) => {
    const n = parseInt(req.params.n);
    if (n <= 2) return res.status(400).send("Paginile 1 și 2 nu pot fi șterse.");
    db.prepare("DELETE FROM sputnik_pages WHERE page_num=?").run(n);
    res.send("OK");
});

// Dynamic GET /sputnik-data/:n
app.get("/sputnik-data/:n", requireAuth, (req, res) => {
    const n = parseInt(req.params.n);
    if (isNaN(n) || n < 1) return res.status(400).send("Invalid page");
    const pageExists = db.prepare("SELECT id FROM sputnik_pages WHERE page_num=?").get(n);
    if (!pageExists) return res.status(404).send("Pagina nu există");
    ensureSputnikTable(n);
    const rows = db.prepare(`SELECT * FROM ${sputnikTable(n)}`).all();
    const today = new Date().toISOString().substring(0, 10);
    const cnps = rows.map(r => r.cnp).filter(Boolean);
    const amenziActiva = cnps.length ? db.prepare(
        `SELECT debitor_cnp FROM amenzi WHERE status='activa' AND termen>=? AND debitor_cnp IN (${cnps.map(()=>'?').join(',')})`
    ).all(today, ...cnps).map(r => r.debitor_cnp) : [];
    const result = rows.map(r => ({ ...r, amendaActiva: amenziActiva.includes(r.cnp) }));
    res.json(result);
});

// Aggregate GET /sputnik-all
app.get("/sputnik-all", requireAuth, (req, res) => {
    let rows = [];
    for (const n of getSputnikPages()) {
        ensureSputnikTable(n);
        rows = rows.concat(
            db.prepare(`SELECT * FROM ${sputnikTable(n)}`).all().map(r => ({ ...r, sourcePage: n }))
        );
    }
    const set = getActiveInvoireCnps((req.session.user.org || 'bratva').toLowerCase());
    const cnps = rows.map(r => r.cnp).filter(Boolean);
    const amenziActiva = cnps.length ? db.prepare(
        `SELECT cnp FROM amenzi WHERE status='activa' AND cnp IN (${cnps.map(()=>'?').join(',')})`
    ).all(...cnps).map(r => r.cnp) : [];
    const result = rows.map(r => ({
        ...r,
        invoire: (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu",
        amendaActiva: amenziActiva.includes(r.cnp)
    }));
    res.json(result);
});

// Dynamic POST /sputnik-data/:n (save)
app.post("/sputnik-data/:n", requireRole("leader"), (req, res) => {
    const n = parseInt(req.params.n);
    if (isNaN(n) || n < 1) return res.status(400).send("Invalid page");
    const pageExists = db.prepare("SELECT id FROM sputnik_pages WHERE page_num=?").get(n);
    if (!pageExists) return res.status(404).send("Pagina nu există");
    ensureSputnikTable(n);
    const tbl = sputnikTable(n);
    db.prepare(`DELETE FROM ${tbl}`).run();
    const stmt = db.prepare(`INSERT INTO ${tbl} (nume,cnp,telefon,grad,task,taskAvansari,invoire,prezenta) VALUES (?,?,?,?,?,?,?,?)`);
    const rows = Array.isArray(req.body) ? req.body : [];
    for (const r of rows) {
        stmt.run(r.nume||'', r.cnp||'', r.telefon||'', r.grad||'', r.task||'', r.taskAvansari||'', r.invoire||'Nu', r.prezenta||'Nu');
    }
    res.send("OK");
});

// Aggregate POST /sputnik-all
app.post("/sputnik-all", requireRole("leader"), (req, res) => {
    const rows = (Array.isArray(req.body) ? req.body : [])
        .map(r => ({
            nume: r.nume || '',
            cnp: r.cnp || '',
            telefon: r.telefon || '',
            grad: r.grad || '',
            task: r.task || '',
            taskAvansari: r.taskAvansari || '',
            invoire: r.invoire || 'Nu',
            prezenta: r.prezenta || 'Nu'
        }))
        .filter(r =>
            (r.nume && r.nume.trim() !== '') ||
            (r.cnp && r.cnp.trim() !== '') ||
            (r.telefon && r.telefon.trim() !== '') ||
            (r.taskAvansari && r.taskAvansari.trim() !== '')
        );

    const pageSize = 35;
    const neededPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const existingPages = getSputnikPages();
    const maxExisting = existingPages.length ? Math.max(...existingPages) : 0;

    for (let n = 1; n <= neededPages; n++) {
        ensureSputnikTable(n);
        db.prepare("INSERT OR IGNORE INTO sputnik_pages (page_num, title) VALUES (?, ?)").run(n, `Pagina ${n}`);
    }
    for (let n = maxExisting + 1; n <= neededPages; n++) {
        ensureSputnikTable(n);
        db.prepare("INSERT OR IGNORE INTO sputnik_pages (page_num, title) VALUES (?, ?)").run(n, `Pagina ${n}`);
    }

    const finalPages = getSputnikPages();
    for (const n of finalPages) {
        ensureSputnikTable(n);
        db.prepare(`DELETE FROM ${sputnikTable(n)}`).run();
    }

    const stmtCache = new Map();
    const getStmt = (n) => {
        if (!stmtCache.has(n)) {
            stmtCache.set(n, db.prepare(
                `INSERT INTO ${sputnikTable(n)} (nume,cnp,telefon,grad,task,taskAvansari,invoire,prezenta) VALUES (?,?,?,?,?,?,?,?)`
            ));
        }
        return stmtCache.get(n);
    };

    rows.forEach((row, index) => {
        const pageNum = Math.floor(index / pageSize) + 1;
        getStmt(pageNum).run(
            row.nume,
            row.cnp,
            row.telefon,
            row.grad,
            row.task,
            row.taskAvansari,
            row.invoire,
            row.prezenta
        );
    });

    res.send("OK");
});

// Dynamic sputnik panel route (page 3+)
app.get('/sputnik-panel/:n', requireAuth, (req, res) => {
    res.redirect('/sputnik-panel');
});

// ---------- SETUP ADMIN ----------
app.get("/setup-admin-x9k2", async (req, res) => {
    const existing = db.prepare("SELECT id FROM users WHERE username='admin'").get();
    if (existing) return res.send("Admin deja există!");
    const hash = await bcrypt.hash("Parola123", 10);
    db.prepare("INSERT INTO users (username,password,role,cnp,org) VALUES (?,?,?,?,?)")
      .run("admin", hash, "leader", "000", "bratva");
    res.send("✓ Admin creat cu succes!");
});

// ── CLEAN URLs ──
app.get('/login',              (req, res) => res.sendFile('bratva-login.html',     { root: 'public' }));
app.get('/service-login',      (req, res) => res.sendFile('service-login.html',    { root: 'public' }));
app.get('/dashboard',          (req, res) => res.sendFile('dashboard.html',        { root: 'public' }));
app.get('/bratva-panel',       (req, res) => res.sendFile('bratva.html',           { root: 'public' }));
app.get('/sputnik-panel',      (req, res) => res.sendFile('sputnik.html',          { root: 'public' }));
app.get('/sputnik2-panel',     (req, res) => res.redirect('/sputnik-panel'));
app.get('/task',               (req, res) => res.sendFile('task.html',             { root: 'public' }));
app.get('/calculator',         (req, res) => res.sendFile('calculator.html',       { root: 'public' }));
app.get('/invoiri-panel',      (req, res) => res.sendFile('invoiri.html',          { root: 'public' }));
app.get('/admin',              (req, res) => res.sendFile('admin.html',            { root: 'public' }));
app.get('/service-panel',      (req, res) => res.sendFile('service-dashboard.html',{ root: 'public' }));
app.get('/service-evidenta',   (req, res) => res.sendFile('service-evidenta.html', { root: 'public' }));
app.get('/service-invoiri',    (req, res) => res.sendFile('service-invoiri.html',  { root: 'public' }));
app.get('/service-admin',      (req, res) => res.sendFile('service-admin.html',    { root: 'public' }));
app.get('/service-pontaje',    (req, res) => res.sendFile('service-pontaje.html',  { root: 'public' }));
app.get('/amenzi',             (req, res) => res.sendFile('amenzi.html',           { root: 'public' }));
app.get('/service-amenzi',     (req, res) => res.sendFile('service-amenzi.html',   { root: 'public' }));
app.get('/locatii',            (req, res) => res.sendFile('locatii.html',          { root: 'public' }));
app.get('/hack',               (req, res) => res.sendFile('hack.html',              { root: 'public' }));

// ── HACK LEADERBOARD API ──
app.get('/hack-leaderboard', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT username, time_seconds, achieved_at
        FROM hack_leaderboard
        ORDER BY time_seconds ASC
        LIMIT 10
    `).all();
    res.json(rows);
});

app.post('/hack-leaderboard', requireAuth, (req, res) => {
    const { time_seconds } = req.body;
    const username = req.session.user?.username;
    if(!username || typeof time_seconds !== 'number' || time_seconds <= 0 || time_seconds > 29) {
        return res.status(400).json({ error: 'Date invalide' });
    }
    // Verifică dacă userul are deja un timp salvat
    const existing = db.prepare(`SELECT id, time_seconds FROM hack_leaderboard WHERE username = ?`).get(username);
    if(existing) {
        // Updatează doar dacă noul timp e mai bun (mai mic)
        if(time_seconds < existing.time_seconds) {
            db.prepare(`UPDATE hack_leaderboard SET time_seconds = ?, achieved_at = datetime('now','localtime') WHERE id = ?`).run(time_seconds, existing.id);
        }
        // Dacă e mai prost sau egal, nu facem nimic
    } else {
        // Userul nu are niciun timp — îl inserăm
        db.prepare(`INSERT INTO hack_leaderboard (username, time_seconds) VALUES (?, ?)`).run(username, time_seconds);
    }
    const rows = db.prepare(`
        SELECT username, time_seconds, achieved_at
        FROM hack_leaderboard
        ORDER BY time_seconds ASC
        LIMIT 10
    `).all();
    res.json(rows);
});

app.delete('/hack-leaderboard', requireAuth, (req, res) => {
    if(req.session.user?.role !== 'leader') return res.status(403).json({ error: 'Interzis' });
    db.prepare(`DELETE FROM hack_leaderboard`).run();
    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
