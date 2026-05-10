const express = require("express");
const cors = require("cors");
const session = require("express-session");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");

const app = express();
const db = new Database("/app/data/database.db");

// Enable WAL mode for better performance
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
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
)`);
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
db.exec(`CREATE TABLE IF NOT EXISTS service (
    id INTEGER PRIMARY KEY,
    nume TEXT, grad TEXT, pontaj TEXT
)`);
try { db.exec(`ALTER TABLE service ADD COLUMN cnp TEXT`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN org TEXT DEFAULT 'bratva'`); } catch {}
try { db.exec(`ALTER TABLE invoiri ADD COLUMN ora TEXT DEFAULT NULL`); } catch {}

// ---------- AUTO-EXPIRY ----------
function checkExpiredTasks() {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const expiredTasks = db.prepare(
        `SELECT * FROM tasks WHERE status='activ' AND deadline IS NOT NULL AND deadline!='' AND deadline<=?`
    ).all(now);

    if (!expiredTasks.length) return;

    const updateTask = db.prepare(`UPDATE tasks SET status='expirat' WHERE id=?`);
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`);
    const getUserByName = db.prepare(`SELECT id FROM users WHERE username=?`);
    const getAllUsers = db.prepare(`SELECT id FROM users`).all.bind(db.prepare(`SELECT id FROM users`));

    for (const task of expiredTasks) {
        updateTask.run(task.id);
        if (task.assignedTo && task.assignedTo !== 'all') {
            const u = getUserByName.get(task.assignedTo);
            if (u) insertNotif.run(u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`);
        } else {
            const users = db.prepare(`SELECT id FROM users`).all();
            for (const u of users) {
                insertNotif.run(u.id, task.id, `⏰ Taskul "${task.title}" a expirat!`);
            }
        }
    }
}
setInterval(checkExpiredTasks, 60 * 1000);
setTimeout(checkExpiredTasks, 2000);

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
        member = db.prepare(`SELECT nume FROM bratva WHERE cnp=?`).get(cnp.trim())
               || db.prepare(`SELECT nume FROM sputnik WHERE cnp=?`).get(cnp.trim())
               || db.prepare(`SELECT nume FROM sputnik2 WHERE cnp=?`).get(cnp.trim());
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
    const today = new Date().toISOString().substring(0, 10);
    const active = db.prepare(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`).all(today, today);
    const set = new Set(active.map(r => (r.cnp || '').trim()).filter(Boolean));
    rows.forEach(r => { r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
    res.json(rows);
});

app.post("/bratva", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM bratva").run();
    const stmt = db.prepare(`INSERT INTO bratva (nume,cnp,telefon,masca,bandana,manusa,sindicat,grad) VALUES (?,?,?,?,?,?,?,?)`);
    for (const d of req.body) stmt.run(d.nume, d.cnp, d.telefon, d.masca ? 1 : 0, d.bandana ? 1 : 0, d.manusa ? 1 : 0, d.sindicat ? 1 : 0, d.grad);
    res.send("Saved");
});

// ---------- SPUTNIK ----------
app.get("/sputnik", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT * FROM sputnik").all();
    const today = new Date().toISOString().substring(0, 10);
    const active = db.prepare(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`).all(today, today);
    const set = new Set(active.map(r => (r.cnp || '').trim()).filter(Boolean));
    rows.forEach(r => { r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
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
    const today = new Date().toISOString().substring(0, 10);
    const active = db.prepare(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`).all(today, today);
    const set = new Set(active.map(r => (r.cnp || '').trim()).filter(Boolean));
    rows.forEach(r => { r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
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
    const today = new Date().toISOString().substring(0, 10);
    const active = db.prepare(`SELECT cnp FROM invoiri WHERE startDate<=? AND endDate>=?`).all(today, today);
    const set = new Set(active.map(r => (r.cnp || '').trim()).filter(Boolean));
    rows.forEach(r => { r.invoire = (r.cnp && set.has(r.cnp.trim())) ? "Da" : "Nu"; });
    res.json(rows);
});

app.post("/service", requireRole("leader"), (req, res) => {
    db.prepare("DELETE FROM service").run();
    const stmt = db.prepare(`INSERT INTO service (nume,cnp,grad,pontaj) VALUES (?,?,?,?)`);
    for (const d of req.body) stmt.run(d.nume, d.cnp, d.grad, d.pontaj);
    res.send("Saved");
});

// ---------- TASKS ----------
app.get("/tasks", requireAuth, (req, res) => {
    res.json(db.prepare("SELECT * FROM tasks ORDER BY createdAt DESC").all());
});

app.get("/my-member-name", requireAuth, (req, res) => {
    const cnp = req.session.user.cnp;
    if (!cnp) return res.json({ names: [] });
    const rows = db.prepare(`SELECT nume FROM bratva WHERE cnp=? UNION SELECT nume FROM sputnik WHERE cnp=? UNION SELECT nume FROM sputnik2 WHERE cnp=?`).all(cnp, cnp, cnp);
    res.json({ names: rows.map(r => r.nume).filter(Boolean) });
});

app.get("/members", requireAuth, (req, res) => {
    const rows = db.prepare(
        `SELECT nume,'Bratva' as faction FROM bratva WHERE nume IS NOT NULL AND nume!=''
         UNION ALL
         SELECT nume,'Sputnik' as faction FROM sputnik WHERE nume IS NOT NULL AND nume!=''
         UNION ALL
         SELECT nume,'Sputnik' as faction FROM sputnik2 WHERE nume IS NOT NULL AND nume!=''
         ORDER BY faction,nume`
    ).all();
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
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`);

    if (assigned !== 'all') {
        const u = db.prepare(`SELECT id FROM users WHERE username=?`).get(assigned);
        if (u) insertNotif.run(u.id, taskId, `📋 Ai primit un task nou: "${title}"`);
    } else {
        const users = db.prepare(`SELECT id FROM users`).all();
        for (const u of users) insertNotif.run(u.id, taskId, `📋 Task nou pentru toți: "${title}"`);
    }
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

// ---------- NOTIFICATIONS ----------
app.get("/notifications/count", requireAuth, (req, res) => {
    const row = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE userId=? AND read=0`).get(req.session.user.id);
    res.json({ count: row ? row.count : 0 });
});

app.get("/notifications", requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT 30`).all(req.session.user.id);
    res.json(rows);
});

app.patch("/notifications/:id/read", requireAuth, (req, res) => {
    db.prepare(`UPDATE notifications SET read=1 WHERE id=? AND userId=?`).run(req.params.id, req.session.user.id);
    res.send("OK");
});

app.post("/notifications/read-all", requireAuth, (req, res) => {
    db.prepare(`UPDATE notifications SET read=1 WHERE userId=?`).run(req.session.user.id);
    res.send("OK");
});

// ---------- ADMIN ----------
app.get("/admin/users", requireRole("leader"), (req, res) => {
    res.json(db.prepare("SELECT id,username,role,cnp FROM users ORDER BY id ASC").all());
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

app.get("/invoiri", requireAuth, (req, res) => {
    const userOrg = (req.session.user.org || 'bratva').toLowerCase();
    const rows = db.prepare(`SELECT * FROM invoiri WHERE COALESCE(org,'bratva')=? ORDER BY startDate DESC, id DESC`).all(userOrg);
    const today = new Date().toISOString().substring(0, 10);
    const list = rows.map(r => ({ ...r, activa: (r.startDate <= today && r.endDate >= today) ? 1 : 0 }));
    res.json(list);
});

app.post("/invoiri", requireAuth, async (req, res) => {
    const { startDate, ora, durataZile, motiv } = req.body;
    if (!startDate || !durataZile) return res.status(400).send("Data și durata sunt obligatorii");
    const dz = parseInt(durataZile, 10);
    if (isNaN(dz) || dz < 1 || dz > 365) return res.status(400).send("Durată invalidă");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).send("Dată invalidă");

    const u = req.session.user;
    const userOrg = (u.org || 'bratva').toLowerCase();
    const endDate = addDays(startDate, dz);

    let member;
    if (userOrg === 'service') {
        member = db.prepare(`SELECT nume FROM service WHERE cnp=? LIMIT 1`).get(u.cnp || '');
    } else {
        member = db.prepare(`SELECT nume FROM bratva WHERE cnp=?`).get(u.cnp || '')
               || db.prepare(`SELECT nume FROM sputnik WHERE cnp=?`).get(u.cnp || '')
               || db.prepare(`SELECT nume FROM sputnik2 WHERE cnp=?`).get(u.cnp || '');
    }
    const nume = member ? member.nume : u.username;

    const result = db.prepare(
        `INSERT INTO invoiri (userId,username,cnp,nume,startDate,ora,durataZile,endDate,motiv,org) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(u.id, u.username, u.cnp || '', nume, startDate, ora || null, dz, endDate, (motiv || '').trim(), userOrg);

    const leaders = db.prepare(
        `SELECT id FROM users WHERE LOWER(role)='leader' AND (COALESCE(org,'bratva')=? OR username='admin')`
    ).all(userOrg);
    const insertNotif = db.prepare(`INSERT INTO notifications (userId,taskId,message) VALUES (?,?,?)`);
    for (const l of leaders) {
        insertNotif.run(l.id, null, `📅 ${nume} a postat o învoire (${startDate} → ${endDate})`);
    }

    res.json({ id: result.lastInsertRowid, endDate });
});

app.delete("/invoiri/:id", requireAuth, (req, res) => {
    const u = req.session.user;
    const row = db.prepare(`SELECT * FROM invoiri WHERE id=?`).get(req.params.id);
    if (!row) return res.status(404).send("Inexistent");
    if (row.userId !== u.id && u.role.toLowerCase() !== 'leader') return res.status(403).send("Interzis");
    db.prepare(`DELETE FROM invoiri WHERE id=?`).run(req.params.id);
    res.send("OK");
});


// ---------- SETUP ADMIN (TEMPORAR - sterge dupa folosire) ----------
app.get("/setup-admin-x9k2", async (req, res) => {
    const existing = db.prepare("SELECT id FROM users WHERE username='admin'").get();
    if (existing) return res.send("Admin deja există!");
    const hash = await bcrypt.hash("Parola123", 10);
    db.prepare("INSERT INTO users (username,password,role,cnp,org) VALUES (?,?,?,?,?)")
      .run("admin", hash, "leader", "000", "bratva");
    res.send("✓ Admin creat cu succes!");
});

// ── CLEAN URLs ──
app.get('/login',           (req, res) => res.sendFile('bratva-login.html',     { root: 'public' }));
app.get('/service-login',   (req, res) => res.sendFile('service-login.html',    { root: 'public' }));
app.get('/dashboard',       (req, res) => res.sendFile('dashboard.html',        { root: 'public' }));
app.get('/bratva-panel',    (req, res) => res.sendFile('bratva.html',           { root: 'public' }));
app.get('/sputnik-panel',   (req, res) => res.sendFile('sputnik.html',          { root: 'public' }));
app.get('/sputnik2-panel',  (req, res) => res.sendFile('sputnik2.html',         { root: 'public' }));
app.get('/task',            (req, res) => res.sendFile('task.html',             { root: 'public' }));
app.get('/calculator',      (req, res) => res.sendFile('calculator.html',       { root: 'public' }));
app.get('/invoiri-panel',   (req, res) => res.sendFile('invoiri.html',          { root: 'public' }));
app.get('/admin',           (req, res) => res.sendFile('admin.html',            { root: 'public' }));
app.get('/service',         (req, res) => res.sendFile('service-dashboard.html',{ root: 'public' }));
app.get('/service-invoiri', (req, res) => res.sendFile('service-invoiri.html',  { root: 'public' }));
app.get('/service-admin',   (req, res) => res.sendFile('service-admin.html',    { root: 'public' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
